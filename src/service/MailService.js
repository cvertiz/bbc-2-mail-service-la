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
                    const itemReference = extractItemReference(parsed.text, parsed.html);
                    const countryCode = extractCountryCode(parsed.text, parsed.html);
                    const {
                        amount,
                        currency
                    } = extractTotalEarnings(parsed.text, parsed.html);

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
                        itemReference,
                        countryCode,
                        amount,
                        currency,
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

                return {
                    host,
                    mailbox,
                    count: ordered.length,
                    messages: ordered.map(m => ({
                        uid: m.uid,
                        itemReference: m.itemReference,
                        countryCode: m.countryCode,
                        amount: m.amount,
                        currency_iso_code: m.currency,
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
export function extractItemReference(bodyText, bodyHtml) {
    // Normaliza a texto plano
    const plain = (bodyText && bodyText.trim().length) ?
        bodyText :
        (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ') : '');
    if (!plain) return null;

    // Busca "Item Reference:" (tolera saltos de línea y espacios)
    // Ej: "Item Reference:\nABB4838" → devuelve ABB4838
    const re = /Item\s*Reference\s*:?\s*([\r\n\t ]*)([A-Za-z0-9][A-Za-z0-9\-_.\/]*)/i;
    const m = plain.match(re);
    return m ? m[2] : null;
}

export function extractCountryCode(bodyText, bodyHtml) {
    // Convierte a texto plano
    const plain = (bodyText && bodyText.trim().length) ?
        bodyText :
        (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ') : '');
    if (!plain) return null;

    // Aísla el bloque SHIPPING DETAILS
    const lower = plain.toLowerCase();
    const startIdx = lower.indexOf('shipping details');
    const scoped = startIdx !== -1 ? plain.slice(startIdx) : plain;

    const endMarkers = ['price details', 'shipping instructions', 'get label', 'more questions', 'contact support'];
    let endIdx = scoped.length;
    for (const m of endMarkers) {
        const i = scoped.toLowerCase().indexOf(m);
        if (i !== -1) endIdx = Math.min(endIdx, i);
    }
    const block = scoped.slice(0, endIdx);

    // Toma la última línea no vacía como candidato a país
    const lines = block.split(/\r?\n+/).map(s => s.trim()).filter(Boolean);
    if (lines.length && /^shipping details$/i.test(lines[0])) lines.shift();
    if (!lines.length) return null;

    let candidate = lines[lines.length - 1].replace(/[,.;]+$/g, '').trim();

    // Si ya es un código de 2 letras en mayúsculas, úsalo
    if (/^[A-Z]{2}$/.test(candidate)) return candidate;

    // Mapeo común nombre → ISO-2
    const map = {
        'us': 'US',
        'usa': 'US',
        'u.s.': 'US',
        'u.s.a.': 'US',
        'united states': 'US',
        'united states of america': 'US',
        'united kingdom': 'GB',
        'uk': 'GB',
        'great britain': 'GB',
        'england': 'GB',
        'canada': 'CA',
        'france': 'FR',
        'germany': 'DE',
        'deutschland': 'DE',
        'spain': 'ES',
        'españa': 'ES',
        'italy': 'IT',
        'italia': 'IT',
        'mexico': 'MX',
        'méxico': 'MX',
        'peru': 'PE',
        'perú': 'PE',
        'australia': 'AU'
    };
    console.log("candidate: ", candidate);

    const normalized = candidate.toLowerCase();
    console.log("normalized: ", normalized);
    console.log("map: ", map);
    return map[normalized] || null;
}


// utils/extractTotalEarnings.js
export function extractTotalEarnings(bodyText, bodyHtml) {
    // 1) Normaliza a texto plano
    const plain = (bodyText && bodyText.trim().length) ?
        bodyText :
        (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, ' ') : '');
    if (!plain) return null;

    // 2) Acota al bloque PRICE DETAILS (si existe)
    const lower = plain.toLowerCase();
    const start = lower.indexOf('price details');
    const scope = start !== -1 ? plain.slice(start, start + 2000) : plain;

    // 3) Regex: "Total Earnings (USD): $412.13" (soporta paréntesis negativos)
    const re = /Total\s*Earnings(?:\s*\(\s*([^)]+?)\s*\))?\s*:\s*(\()?[-–—]?\s*(US\$|CA\$|AU\$|NZ\$|R\$|S\/|€|£|\$)?\s*([\d.,\s]+)\)?/i;
    const m = scope.match(re);
    if (!m) return null;

    const currencyFromParens = m[1]?.trim();
    const isParenNeg = Boolean(m[2]);
    const symbol = m[3] ? m[3].toUpperCase() : null;
    const rawAmount = (m[4] || '').trim();

    // 4) Parseo robusto de monto (soporta US y EU)
    const parseAmount = (s) => {
        let v = s.replace(/\s/g, '');
        if (v.includes(',') && v.includes('.')) {
            // Decide decimal por el último separador visto
            if (v.lastIndexOf(',') > v.lastIndexOf('.')) {
                v = v.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
            } else {
                v = v.replace(/,/g, ''); // 1,234.56 -> 1234.56
            }
        } else if (v.includes(',') && !v.includes('.')) {
            v = v.replace(',', '.'); // 1234,56 -> 1234.56
        } else if ((v.match(/\./g) || []).length > 1) {
            // Múltiples puntos: último es decimal
            const parts = v.split('.');
            const dec = parts.pop();
            v = parts.join('') + '.' + dec;
        }
        const n = parseFloat(v);
        return Number.isNaN(n) ? null : n;
    };

    let amount = parseAmount(rawAmount);
    if (amount == null) return null;
    if (isParenNeg) amount = -amount;

    // 5) Detección de currency
    const CODE_MAP = {
        USD: 'USD',
        EUR: 'EUR',
        GBP: 'GBP',
        MXN: 'MXN',
        CAD: 'CAD',
        AUD: 'AUD',
        NZD: 'NZD',
        BRL: 'BRL',
        PEN: 'PEN',
        JPY: 'JPY',
        CNY: 'CNY',
        INR: 'INR',
        COP: 'COP',
        CLP: 'CLP',
        ARS: 'ARS',
        CHF: 'CHF'
    };
    const SYMBOL_MAP = {
        'US$': 'USD',
        'CA$': 'CAD',
        'AU$': 'AUD',
        'NZ$': 'NZD',
        'R$': 'BRL',
        'S/': 'PEN',
        '$': 'USD',
        '€': 'EUR',
        '£': 'GBP'
    };

    let currency = null;

    if (currencyFromParens) {
        const code = currencyFromParens.replace(/[^A-Za-z]/g, '').toUpperCase();
        if (CODE_MAP[code]) currency = CODE_MAP[code];
        else if (/^[A-Z]{2,4}$/.test(code)) currency = code; // acepta códigos no mapeados
    }

    if (!currency && symbol) {
        // Normaliza símbolos tipo 'us$'
        const symNorm = symbol.toUpperCase();
        currency = SYMBOL_MAP[symNorm] || SYMBOL_MAP[symNorm.replace(/\s+/g, '')] || null;
    }

    return {
        amount,
        currency
    };
}