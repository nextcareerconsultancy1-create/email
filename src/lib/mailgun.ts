export interface MailgunAccount {
  id: string;
  name: string;
  domain: string;
  apiKey: string;
  from: string;
}

/**
 * Dynamically reads all MAILGUN_N_DOMAIN / MAILGUN_N_API_KEY / MAILGUN_N_FROM
 * environment variables and returns an array of configured accounts.
 * This makes it trivial to add more accounts – just add new env vars.
 */
export function getMailgunAccounts(): MailgunAccount[] {
  const accounts: MailgunAccount[] = [];

  for (let i = 1; i <= 20; i++) {
    const domain = process.env[`MAILGUN_${i}_DOMAIN`];
    const apiKey = process.env[`MAILGUN_${i}_API_KEY`];
    const from = process.env[`MAILGUN_${i}_FROM`];

    if (domain && apiKey && from) {
      accounts.push({
        id: String(i),
        name: `Account ${i}`,
        domain,
        apiKey,
        from,
      });
    }
  }

  return accounts;
}

/**
 * Returns account info safe to send to the frontend (no API keys).
 */
export function getSafeAccounts() {
  return getMailgunAccounts().map(({ id, name, domain, from }) => ({
    id,
    name,
    domain,
    from,
  }));
}

/**
 * Find a specific account by its ID. Returns null if not found.
 */
export function getMailgunAccountById(id: string): MailgunAccount | null {
  return getMailgunAccounts().find((a) => a.id === id) ?? null;
}
