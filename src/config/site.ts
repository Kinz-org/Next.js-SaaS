export const siteConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? "Next.js SaaS",
  description:
    "Production-grade AI SaaS boilerplate - multi-tenant, RBAC, audit logs, GDPR, MCP-ready.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  links: {
    github: "https://github.com/Kinz-org/Next.js-SaaS",
    gumroad: "https://gumroad.com/l/your-saas-boilerplate", // Update after listing
    docs: "/docs",
  },
};

export type SiteConfig = typeof siteConfig;
