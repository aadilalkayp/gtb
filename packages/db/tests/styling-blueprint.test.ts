import { describe, expect, it } from "vitest";
import { prisma, getEnhancedPrisma } from "../src/index.js";
import { seedAssignment, seedClient, seedUser } from "./helpers.js";

/**
 * Styling Blueprint access policies (STYLING_BLUEPRINT.md): the client never
 * reads draft tables through the gateway; the assigned stylist edits content
 * but never workflow fields; other assigned staff only read; unrelated staff
 * see nothing.
 */
async function world() {
  await seedUser({ id: "stylist", role: "styling_consultant" });
  await seedUser({ id: "otherStylist", role: "styling_consultant" });
  await seedUser({ id: "cro", role: "cro" });
  await seedUser({ id: "ops", role: "ops_head" });
  await seedUser({ id: "clientUser", role: "client" });
  await seedClient({ id: "c1", userId: "clientUser" });
  await seedAssignment({ clientId: "c1", staffId: "stylist", role: "styling_consultant" });
  await seedAssignment({ clientId: "c1", staffId: "cro", role: "cro" });
  const bp = await prisma.stylingBlueprint.create({
    data: { clientId: "c1", status: "under_review" },
  });
  const doc = await prisma.document.create({
    data: {
      clientId: "c1",
      type: "styling_image",
      fileName: "edit.jpg",
      fileUrl: "c1/styling_image/x.jpg",
      fileSize: 1,
      uploadedById: "stylist",
    },
  });
  const photoDoc = await prisma.document.create({
    data: {
      clientId: "c1",
      type: "styling_photo",
      fileName: "front.jpg",
      fileUrl: "c1/styling_photo/y.jpg",
      fileSize: 1,
      uploadedById: "clientUser",
    },
  });
  await prisma.stylingPhoto.create({
    data: { blueprintId: bp.id, slot: "front", documentId: photoDoc.id },
  });
  return { bp, doc };
}

const as = (id: string, role: Parameters<typeof seedUser>[0]["role"]) =>
  getEnhancedPrisma({ id, role });

describe("Styling Blueprint policies", () => {
  it("hides every draft table and styling file from the client", async () => {
    const { bp } = await world();
    await prisma.stylingLook.create({ data: { blueprintId: bp.id, title: "Draft look" } });
    const db = as("clientUser", "client");
    expect(await db.stylingBlueprint.findMany()).toHaveLength(0);
    expect(await db.stylingLook.findMany()).toHaveLength(0);
    expect(await db.stylingPhoto.findMany()).toHaveLength(0);
    expect(await db.stylingBlueprintVersion.findMany()).toHaveLength(0);
    const docs = await db.document.findMany({ where: { clientId: "c1" } });
    expect(docs.map((d) => d.type)).not.toContain("styling_image");
    expect(docs.map((d) => d.type)).not.toContain("styling_photo");
    await expect(
      db.stylingLook.create({ data: { blueprintId: bp.id, title: "Mine" } }),
    ).rejects.toThrow();
  });

  it("lets the assigned stylist edit content but not workflow fields", async () => {
    const { bp } = await world();
    const db = as("stylist", "styling_consultant");
    await db.stylingBlueprint.update({
      where: { id: bp.id },
      data: { faceShape: "Oval", styleTags: ["Clean"], sectionsDone: ["profile"] },
    });
    const look = await db.stylingLook.create({
      data: { blueprintId: bp.id, title: "Ceremony", colors: ["#ffffff"] },
    });
    await db.stylingLook.update({ where: { id: look.id }, data: { title: "Ceremony look" } });
    await db.stylingItem.create({ data: { blueprintId: bp.id, kind: "product", name: "Loafers" } });

    await expect(
      db.stylingBlueprint.update({ where: { id: bp.id }, data: { status: "published" } }),
    ).rejects.toThrow();
    await expect(
      db.stylingBlueprint.update({ where: { id: bp.id }, data: { publishedVersion: 3 } }),
    ).rejects.toThrow();
    await expect(
      db.stylingBlueprint.update({ where: { id: bp.id }, data: { dueAt: new Date() } }),
    ).rejects.toThrow();
    await expect(
      db.stylingBlueprint.update({ where: { id: bp.id }, data: { checkedEssentialIds: ["x"] } }),
    ).rejects.toThrow();
    // Photos and versions are server-written only.
    await expect(
      db.stylingPhoto.updateMany({ where: { blueprintId: bp.id }, data: { retakeNote: "again" } }),
    ).rejects.toThrow();
    await expect(
      db.stylingBlueprintVersion.create({
        data: { blueprintId: bp.id, version: 1, snapshot: {}, publishedById: "stylist" },
      }),
    ).rejects.toThrow();

    const fresh = await prisma.stylingBlueprint.findUniqueOrThrow({ where: { id: bp.id } });
    expect(fresh.status).toBe("under_review");
    expect(fresh.faceShape).toBe("Oval");
  });

  it("gives other assigned staff read-only access and unrelated staff none", async () => {
    const { bp } = await world();
    await prisma.stylingLook.create({ data: { blueprintId: bp.id, title: "Draft look" } });

    const cro = as("cro", "cro");
    expect(await cro.stylingBlueprint.findMany()).toHaveLength(1);
    expect(await cro.stylingLook.findMany()).toHaveLength(1);
    await expect(
      cro.stylingLook.create({ data: { blueprintId: bp.id, title: "CRO look" } }),
    ).rejects.toThrow();
    await expect(
      cro.stylingBlueprint.update({ where: { id: bp.id }, data: { faceShape: "Square" } }),
    ).rejects.toThrow();

    const other = as("otherStylist", "styling_consultant");
    expect(await other.stylingBlueprint.findMany()).toHaveLength(0);
    expect(await other.stylingLook.findMany()).toHaveLength(0);
    await expect(
      other.stylingLook.create({ data: { blueprintId: bp.id, title: "Hijack" } }),
    ).rejects.toThrow();
  });

  it("lets admins edit any Blueprint's content", async () => {
    const { bp } = await world();
    const db = as("ops", "ops_head");
    await db.stylingBlueprint.update({
      where: { id: bp.id },
      data: { hairNotes: "Trim a week before" },
    });
    await db.stylingEssential.create({ data: { blueprintId: bp.id, item: "Lint roller" } });
    await expect(
      db.stylingBlueprint.update({ where: { id: bp.id }, data: { status: "published" } }),
    ).rejects.toThrow();
  });

  it("scopes the library to the styling team, authored as oneself", async () => {
    await world();
    const stylist = as("stylist", "styling_consultant");
    const item = await stylist.stylingLibraryItem.create({
      data: { kind: "essential", title: "Safety pins", createdById: "stylist" },
    });
    await expect(
      stylist.stylingLibraryItem.create({
        data: { kind: "essential", title: "Spoofed", createdById: "ops" },
      }),
    ).rejects.toThrow();
    await expect(stylist.stylingLibraryItem.delete({ where: { id: item.id } })).rejects.toThrow();
    expect(await as("cro", "cro").stylingLibraryItem.findMany()).toHaveLength(0);
    expect(await as("clientUser", "client").stylingLibraryItem.findMany()).toHaveLength(0);
    await as("ops", "ops_head").stylingLibraryItem.delete({ where: { id: item.id } });
  });
});

describe("Chat policies", () => {
  async function chatWorld() {
    await world();
    await seedUser({ id: "otherClientUser", role: "client" });
    await seedClient({ id: "c2", userId: "otherClientUser" });
    const conv = await prisma.conversation.create({ data: { clientId: "c1", kind: "styling" } });
    await prisma.message.create({
      data: { conversationId: conv.id, senderId: "clientUser", body: "Hi" },
    });
    await prisma.conversationRead.create({
      data: { conversationId: conv.id, userId: "stylist", lastReadAt: new Date() },
    });
    return conv;
  }

  it("lets the client, their stylist and admins read; nobody else", async () => {
    await chatWorld();
    for (const [id, role] of [
      ["clientUser", "client"],
      ["stylist", "styling_consultant"],
      ["ops", "ops_head"],
    ] as const) {
      expect(await as(id, role).message.findMany()).toHaveLength(1);
      expect(await as(id, role).conversation.findMany()).toHaveLength(1);
    }
    for (const [id, role] of [
      ["otherClientUser", "client"],
      ["cro", "cro"],
      ["otherStylist", "styling_consultant"],
    ] as const) {
      expect(await as(id, role).message.findMany()).toHaveLength(0);
      expect(await as(id, role).conversation.findMany()).toHaveLength(0);
    }
  });

  it("allows no gateway writes and keeps read receipts private", async () => {
    const conv = await chatWorld();
    await expect(
      as("clientUser", "client").message.create({
        data: { conversationId: conv.id, senderId: "clientUser", body: "x" },
      }),
    ).rejects.toThrow();
    await expect(
      as("stylist", "styling_consultant").message.create({
        data: { conversationId: conv.id, senderId: "stylist", body: "x" },
      }),
    ).rejects.toThrow();
    await expect(
      as("stylist", "styling_consultant").conversation.update({
        where: { id: conv.id },
        data: { lastSenderIsClient: false },
      }),
    ).rejects.toThrow();
    expect(await as("stylist", "styling_consultant").conversationRead.findMany()).toHaveLength(1);
    expect(await as("clientUser", "client").conversationRead.findMany()).toHaveLength(0);
  });

  it("hides chat attachments from the client's and staff's document lists", async () => {
    await chatWorld();
    await prisma.document.create({
      data: {
        clientId: "c1",
        type: "chat_attachment",
        fileName: "a.pdf",
        fileUrl: "c1/chat_attachment/a.pdf",
        fileSize: 1,
        uploadedById: "stylist",
      },
    });
    expect((await as("clientUser", "client").document.findMany()).map((d) => d.type)).not.toContain(
      "chat_attachment",
    );
    expect(
      (await as("stylist", "styling_consultant").document.findMany()).map((d) => d.type),
    ).not.toContain("chat_attachment");
    expect((await as("ops", "ops_head").document.findMany()).map((d) => d.type)).toContain(
      "chat_attachment",
    );
  });
});
