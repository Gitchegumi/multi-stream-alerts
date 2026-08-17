import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { legalContactEmail, legalEffectiveDate, legalOperatorName } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms & Conditions | GitchAlerts',
  description: 'Terms governing use of this GitchAlerts service.',
};

export default function TermsPage() {
  const operator = legalOperatorName();
  const contactEmail = legalContactEmail();

  return (
    <LegalPage title="Terms & Conditions" effectiveDate={legalEffectiveDate}>
      <p>
        These Terms govern your use of this GitchAlerts deployment operated by {operator} (“we,”
        “us,” or “our”). By accessing or using the service, you agree to these Terms. If you use the
        service for an organization, you represent that you can bind that organization.
      </p>

      <h2>The service</h2>
      <p>
        GitchAlerts provides self-hosted tools for stream alerts, browser-source overlays, assets,
        event routing, and optional third-party integrations. Features may change, be suspended, or
        be discontinued. Your right to use the open-source software separately is governed by the
        license distributed with its source code; these Terms govern use of this hosted instance.
      </p>

      <h2>Accounts and security</h2>
      <p>
        You must provide accurate information, keep credentials and browser-source keys secure, and
        promptly report suspected unauthorized access. You are responsible for activity under your
        account and for ensuring that people you invite have appropriate permissions. You may not
        attempt to bypass authentication, access another workspace, or interfere with the service.
      </p>

      <h2>Your content and permissions</h2>
      <p>
        You retain ownership of content you upload or configure. You grant us a limited,
        non-exclusive license to host, copy, process, transmit, and display that content only as
        necessary to operate and improve the service. You represent that you have the rights needed
        for your content and that its use does not violate law or another person&apos;s rights.
      </p>

      <h2>Acceptable use</h2>
      <p>You may not use the service to:</p>
      <ul>
        <li>
          break the law, infringe intellectual-property or privacy rights, or facilitate fraud;
        </li>
        <li>harass, threaten, exploit, or distribute unlawful or malicious content;</li>
        <li>introduce malware, probe vulnerabilities, disrupt service, or evade usage controls;</li>
        <li>misrepresent affiliation with us or a connected provider; or</li>
        <li>
          access provider data beyond the permissions and purposes a user knowingly authorizes.
        </li>
      </ul>

      <h2>Third-party services</h2>
      <p>
        Google, YouTube, Twitch, Ko-fi, identity providers, and hosting services have their own
        terms and privacy policies. We do not control those services and are not responsible for
        their availability or actions. You authorize us to exchange data with them only as needed
        for the integrations you enable, and you remain responsible for complying with their terms.
      </p>

      <h2>Suspension and termination</h2>
      <p>
        You may stop using the service and disconnect providers at any time. We may restrict or
        terminate access when reasonably necessary to address a Terms violation, security risk,
        legal requirement, nonpayment if applicable, or harm to the service or others. Provisions
        that by their nature should survive termination will survive.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        To the maximum extent permitted by law, the service is provided “as is” and “as available,”
        without warranties of merchantability, fitness for a particular purpose, non-infringement,
        or uninterrupted operation. We are not liable for indirect, incidental, special,
        consequential, exemplary, or lost-profit damages, or for provider outages, lost streams,
        lost content, or unauthorized access outside our reasonable control. Our aggregate liability
        arising from the service will not exceed the amount you paid us for the service during the
        12 months before the claim, or US$100 if you paid nothing. Some jurisdictions do not allow
        these limits, so they apply only to the extent permitted by law.
      </p>

      <h2>Indemnity</h2>
      <p>
        To the extent permitted by law, you will defend and indemnify us against claims, losses, and
        expenses arising from your content, your misuse of the service, or your violation of these
        Terms or another person&apos;s rights.
      </p>

      <h2>Changes and general terms</h2>
      <p>
        We may update these Terms and will revise the effective date. Material changes should be
        communicated through the service. If a provision is unenforceable, the rest remain in
        effect. Failure to enforce a provision is not a waiver. You may not transfer these Terms
        without our consent; we may transfer them with the service. The laws and courts applicable
        to these Terms are those of the operator&apos;s principal place of business, except where
        consumer law requires otherwise.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms should be sent to {operator}
        {contactEmail ? (
          <>
            {' '}
            at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </>
        ) : (
          '. The instance administrator should configure LEGAL_CONTACT_EMAIL before public use.'
        )}
      </p>
    </LegalPage>
  );
}
