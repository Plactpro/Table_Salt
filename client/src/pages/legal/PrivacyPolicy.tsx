import { PageTitle } from "@/lib/accessibility";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen p-6 bg-background">
      <PageTitle title="Privacy Policy" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg">Skip to main content</a>
      <div className="max-w-3xl mx-auto py-8" id="main-content">
        <div className="flex items-center justify-center mb-8">
          <TableSaltLogo variant="full" iconSize={32} />
        </div>
        <h1 className="text-3xl font-bold mb-2" data-testid="text-privacy-title">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 29, 2026</p>
        <div className="prose prose-sm max-w-none space-y-4 text-sm leading-relaxed">
          <p>
            This Privacy Policy describes how Table Salt collects, uses, and protects information collected from
            restaurant operators, their staff, and end customers who interact with the platform.
          </p>
          <p>
            This page is a placeholder. The full Privacy Policy is being prepared and will be published before public
            launch.
          </p>
          <h2 className="text-xl font-semibold mt-8">Contact</h2>
          <p>Table Salt is operated by PLACTPRO LLC.</p>
          <p>
            During the pre-launch period, contact{" "}
            <a href="mailto:support@inifinit.com" className="text-primary hover:underline" data-testid="link-privacy-contact">
              support@inifinit.com
            </a>{" "}
            for any privacy or legal inquiries.
          </p>
        </div>
        <p className="mt-12 text-xs text-muted-foreground text-center">
          © {new Date().getFullYear()} Table Salt
        </p>
      </div>
    </div>
  );
}
