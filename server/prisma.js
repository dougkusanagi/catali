import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL || "file:./storage/database.db";
const adapter = new PrismaLibSql({ url: databaseUrl });

export const prisma = new PrismaClient({ adapter });
