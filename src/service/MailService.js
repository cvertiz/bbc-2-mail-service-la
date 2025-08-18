// src/service/MailService.js
import {
    ImapFlow
} from 'imapflow';
import {
    simpleParser
} from 'mailparser';

const HOSTS = [process.env.IMAP_HOST || 'imap.ionos.fr'];

function buildCriteria(filters = {}) {
    const c = {};
    if (filters.unseen === true) c.seen = false;
    if (filters.since) c.since = new Date(filters.since);
    if (filters.subject) c.subject = String(filters.subject);
    if (filters.from) c.from = String(filters.from);
    if (filters.to) c.to = String(filters.to);
    return c;
}

/** 1) Solo buscar UIDs (rápido, sin bodies) */
export async function searchEmailUids({
    mailbox = 'INBOX',
    limit = 10,
    filters = {},
    user = process.env.EMAIL_USER,
    pass = process.env.EMAIL_PASS,
    port = Number(process.env.IMAP_PORT || 993),
    secure = true
} = {}) {
    if (!user || !pass) throw new Error('Faltan credenciales EMAIL_USER/EMAIL_PASS');
    const criteria = buildCriteria(filters);

    let lastErr;
    for (const host of HOSTS) {
        const client = new ImapFlow({
            host,
            port,
            secure,
            auth: {
                user,
                pass
            },
            tls: {
                minVersion: 'TLSv1.2'
            },
            logger: false
        });

        try {
            await client.connect();
            const lock = await client.getMailboxLock(mailbox);
            try {
                const uids = await client.search(Object.keys(criteria).length ? criteria : {});
                const selected = limit ? uids.slice(-Number(limit)) : uids; // últimos N
                return {
                    host,
                    mailbox,
                    total: uids.length,
                    count: selected.length,
                    uids: selected
                };
            } finally {
                lock.release();
                await client.logout();
            }
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

/** 2) Con un conjunto de UIDs, traer envelope + body (sin marcar leído) */
export async function fetchBodiesByUids({
    uids = [],
    mailbox = 'INBOX',
    markSeen = false,
    user = process.env.EMAIL_USER,
    pass = process.env.EMAIL_PASS,
    port = Number(process.env.IMAP_PORT || 993),
    secure = true
} = {}) {
    if (!user || !pass) throw new Error('Faltan credenciales EMAIL_USER/EMAIL_PASS');
    if (!Array.isArray(uids) || uids.length === 0) return {
        mailbox,
        count: 0,
        messages: []
    };

    let lastErr;
    for (const host of HOSTS) {
        const client = new ImapFlow({
            host,
            port,
            secure,
            auth: {
                user,
                pass
            },
            tls: {
                minVersion: 'TLSv1.2'
            },
            logger: false
        });

        try {
            await client.connect();
            const lock = await client.getMailboxLock(mailbox);
            try {
                const messages = [];

                // fetch acepta array de UIDs; usa BODY.PEEK[] (via source) → no marca \Seen
                for await (const msg of client.fetch(uids, {
                    envelope: true,
                    internalDate: true,
                    flags: true,
                    source: true
                })) {
                    const parsed = await simpleParser(msg.source);
                    const totalEarningsUSD = extractTotalEarningsUSD(parsed.text, parsed.html);


                    messages.push({
                        uid: msg.uid,
                        subject: parsed.subject || msg.envelope?.subject || '',
                        from: parsed.from?.text || '',
                        to: parsed.to?.text || '',
                        date: (parsed.date || msg.internalDate)?.toISOString?.() || null,
                        body: {
                            text: parsed.text || null,
                            html: parsed.html || null
                        },
                        totalEarningsUSD,
                        flags: Array.isArray(msg.flags) ? [...msg.flags] : [...(msg.flags || [])],
                        attachments: (parsed.attachments || []).map(a => ({
                            filename: a.filename,
                            contentType: a.contentType,
                            size: a.size
                        }))
                    });

                    if (markSeen) {
                        await client.messageFlagsAdd({
                            uid: msg.uid
                        }, ['\\Seen']);
                    }
                }

                // Ordena como los uids solicitados
                const byUid = new Map(messages.map(m => [m.uid, m]));
                const ordered = uids.map(u => byUid.get(u)).filter(Boolean);

                const totales = messages.map(m => ({
                    uid: m.uid,
                    total: m.totalEarningsUSD // número, p. ej. 412.13
                }));
                console.log("totales: ",totales);

                return {
                    host,
                    mailbox,
                    count: ordered.length,
                    messages: ordered.map(m => ({
                        uid: m.uid,
                        total: m.totalEarningsUSD
                    }))
                };

            } finally {
                lock.release();
                await client.logout();
            }
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr;
}

// utils/extractTotalEarningsUSD.js
export function extractTotalEarningsUSD(bodyText, bodyHtml) {
    // 1) Normaliza a texto plano
    const plain = (bodyText && bodyText.trim().length) ?
        bodyText :
        (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ') : '');

    if (!plain) return null;

    // 2) Reduce el scope al bloque PRICE DETAILS si existe (evita falsos positivos)
    const lower = plain.toLowerCase();
    const start = lower.indexOf('price details');
    const scope = start !== -1 ? plain.slice(start, start + 2000) : plain;

    // 3) Extrae Total Earnings (USD) admitiendo: "Total Earnings (USD): $412.13"
    //    También soporta signo negativo o paréntesis contables: ($412.13)
    const re = /Total\s*Earnings(?:\s*\(\s*USD\s*\))?\s*:\s*(\()?[-–—]?\s*\$?\s*([\d,]+(?:\.\d{2})?)\)?/i;
    const m = scope.match(re);
    if (!m) return null;

    const isParenNeg = Boolean(m[1]);
    const val = parseFloat(m[2].replace(/,/g, ''));
    if (Number.isNaN(val)) return null;

    return isParenNeg ? -val : val;
}