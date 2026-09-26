import { createServer, type Server } from "node:http";

const contacts = new Map<string, Set<string>>();
const blocked = new Set<string>();
let server: Server | undefined;

export function addRelationshipContact(ownerId: string, contactUserId: string): void { const values = contacts.get(ownerId) ?? new Set<string>(); values.add(contactUserId); contacts.set(ownerId, values); }
export function blockRelationshipUser(firstUserId: string, secondUserId: string): void { blocked.add(`${firstUserId}:${secondUserId}`); }
export function resetRelationshipMock(): void { contacts.clear(); blocked.clear(); }

export async function startRelationshipMock(): Promise<void> {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/internal/relationships/check") {
        const isBlocked = blocked.has(`${body.firstUserId}:${body.secondUserId}`) || blocked.has(`${body.secondUserId}:${body.firstUserId}`);
        response.end(JSON.stringify({ success: true, data: { blocked: isBlocked, areContacts: contacts.get(body.firstUserId)?.has(body.secondUserId) ?? false } }));
        return;
      }
      if (request.url === "/internal/relationships/contacts/batch") {
        const values = contacts.get(body.ownerId) ?? new Set<string>();
        response.end(JSON.stringify({ success: true, data: { contacts: body.contactUserIds.filter((id: string) => values.has(id)).map((contactUserId: string) => ({ contactUserId, customName: null })) } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ success: false }));
    });
  });
  await new Promise<void>((resolve, reject) => { server?.once("error", reject); server?.listen(0, "127.0.0.1", () => resolve()); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("relationship mock did not expose a port");
  process.env.RELATIONSHIP_SERVICE_URL = `http://127.0.0.1:${address.port}`;
}

export async function stopRelationshipMock(): Promise<void> { if (server?.listening === true) await new Promise<void>((resolve) => server?.close(() => resolve())); server = undefined; }
