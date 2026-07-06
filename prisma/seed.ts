import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

const treatmentCategories = ["급여치료", "자보", "한약", "비만", "피부·한방성형"];
const visitTypes = ["초진", "재초진", "재진", "전화상담"];
const staffUsers = [
  { name: "김우석", role: "원장" },
  { name: "박간호", role: "직원" },
  { name: "최실장", role: "직원" },
];

async function main() {
  for (const [index, name] of treatmentCategories.entries()) {
    await prisma.treatmentCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: index },
    });
  }

  for (const [index, name] of visitTypes.entries()) {
    await prisma.visitType.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: index },
    });
  }

  for (const { name, role } of staffUsers) {
    await prisma.staffUser.upsert({
      where: { name },
      update: {},
      create: { name, role },
    });
  }

  console.log("Seed complete.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
