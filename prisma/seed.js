import { prisma } from "../server/prisma.js";

await prisma.promotion.upsert({
  where: { id: 1 },
  update: {},
  create: {
    id: 1,
    title: "Ofertas da semana",
    subtitle: "Preço de atacado para você economizar de verdade",
    badgeText: "ATACADO",
    hashtag: "#VEMPROCRÔNICAS",
  },
});

await prisma.$disconnect();
