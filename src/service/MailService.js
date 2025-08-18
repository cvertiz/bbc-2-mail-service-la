import {
    ImapFlow
} from 'imapflow';
import {
    simpleParser
} from 'mailparser';

const HOSTS = [process.env.IMAP_HOST || 'imap.ionos.fr'];

export async function listEmails(opts = {}) {
    console.log("hosts:", HOSTS);
    const {
        user = process.env.EMAIL_USER,
            pass = process.env.EMAIL_PASS,
            port = Number(process.env.IMAP_PORT || 993), // <-- fallback correcto para IMAPS
            secure = true,
            mailbox = 'INBOX',
            limit = 10,
            filters = {},
            markSeen = false
    } = opts;

    if (!user || !pass) throw new Error('Faltan credenciales EMAIL_USER/EMAIL_PASS');

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
            // logger: false, // descomenta si quieres silenciar logs de imapflow
        });

        console.log(`Conectando a ${host}:${port}...`);
        console.log(`Buzón: ${mailbox}, Límite: ${limit}, Marcar como leído: ${markSeen}`);
        console.log(`Filtros: ${JSON.stringify(filters)}`);

        try {
            await client.connect();
            const lock = await client.getMailboxLock(mailbox);
            try {
                // --- Construcción de criterios ---
                const criteria = {};
                if (filters.unseen === true) criteria.seen = false;
                if (filters.since) criteria.since = new Date(filters.since);
                if (filters.subject) criteria.subject = String(filters.subject);
                if (filters.from) criteria.from = String(filters.from);
                if (filters.to) criteria.to = String(filters.to);

                // Si no hay filtros, no fuerces UNSEEN a menos que realmente lo quieras
                const searchCriteria = Object.keys(criteria).length ? criteria : {}; // <-- antes ponías seen:false
                const uids = await client.search(searchCriteria);
                const last = uids.slice(-Number(limit || 10));

                const messages = [];
                for await (const msg of client.fetch(last, {
                    envelope: true,
                    internalDate: true,
                    flags: true,
                    source: true
                })) {
                    const parsed = await simpleParser(msg.source);
                    messages.push({
                        uid: msg.uid,
                        subject: parsed.subject || msg.envelope?.subject || '',
                        from: parsed.from?.text || '',
                        to: parsed.to?.text || '',
                        date: (parsed.date || msg.internalDate)?.toISOString?.() || null,
                        textPreview: (parsed.text || '').slice(0, 500),
                        hasHtml: Boolean(parsed.html),
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

                return {
                    host,
                    mailbox,
                    count: messages.length,
                    messages
                };
            } finally {
                lock.release();
                await client.logout();
            }
        } catch (err) {
            lastErr = err;
            if (err?.code === 'ETIMEDOUT') {
                lastErr = new Error(`Timeout conectando a ${host}:${port}. Verifica IMAP 993 y salida a Internet.`);
            } else if (err?.authenticationFailed) {
                lastErr = new Error('Autenticación IMAP fallida (usuario/clave). Valida en Webmail o restablece la contraseña.');
            }
            // sigue con siguiente host si existiera
        }
    }
    throw lastErr;
}
