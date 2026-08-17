import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { legalContactEmail, legalEffectiveDate, legalOperatorName } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | GitchAlerts',
  description: 'How GitchAlerts accesses, uses, stores, and shares personal and provider data.',
};

export default function PrivacyPage() {
  const operator = legalOperatorName();
  const contactEmail = legalContactEmail();

  return (
    <LegalPage title="Privacy Policy" effectiveDate={legalEffectiveDate}>
      <p>
        This policy explains how {operator} (“we,” “us,” or “our”) handles information when you use
        this deployment of GitchAlerts. GitchAlerts is self-hosted software, so each deployment is
        operated independently. The operator named above is responsible for this instance and its
        data practices.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> identifiers, email address, display name, roles,
          workspace memberships, and authentication records supplied by the configured sign-in
          provider.
        </li>
        <li>
          <strong>Google and YouTube data:</strong> when you connect YouTube, we receive your Google
          account identifier and profile information, OAuth tokens, token expiration, and your
          YouTube channel identifier and public channel title. The requested read-only YouTube
          permission is used to identify the channel you select and configure alert delivery.
        </li>
        <li>
          <strong>Twitch data:</strong> when you connect Twitch, we receive your Twitch account
          identifier, username or display name, OAuth tokens, and events you authorize for stream
          alerts, such as follows, subscriptions, cheers, raids, charity donations, and channel
          point redemptions.
        </li>
        <li>
          <strong>Creator content and activity:</strong> workspace settings, alert configurations,
          uploaded assets, provider webhook events, alert history, and other content you submit.
        </li>
        <li>
          <strong>Technical information:</strong> security, diagnostic, and access logs that may
          include timestamps, request details, browser information, and IP addresses, depending on
          how this instance and its hosting infrastructure are configured.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>
        We use information only to authenticate users; link and maintain integrations you request;
        receive, route, display, and troubleshoot stream alerts; operate and secure the service;
        prevent abuse; provide support; and comply with law. YouTube access is read-only:
        GitchAlerts does not upload, edit, or delete your YouTube content.
      </p>
      <p>
        GitchAlerts&apos; use and transfer of information received from Google APIs adheres to the
        Google API Services User Data Policy, including its Limited Use requirements. We do not use
        Google user data for advertising, sell it, or use it to train generalized artificial
        intelligence or machine-learning models.
      </p>

      <h2>When information is shared</h2>
      <p>
        We do not sell personal information. Information may be shared with Google, YouTube, Twitch,
        Ko-fi, the configured identity provider, and hosting or infrastructure providers only as
        needed to provide the features you choose. It may also be disclosed when required by law, to
        protect rights and safety, or as part of a transfer of this service, subject to appropriate
        safeguards. Public browser-source output may show alert information to your stream audience
        according to your configuration.
      </p>

      <h2>Storage, security, and retention</h2>
      <p>
        OAuth tokens and integration secrets are encrypted at rest, access is restricted by
        workspace permissions, and HTTPS should be used in production. No system is completely
        secure. Data is retained while needed to provide the service and according to the
        operator&apos;s backup, logging, and legal requirements. Disconnecting a Twitch or YouTube
        account stops its use and removes locally stored OAuth token material. Non-secret connection
        metadata may remain for security and audit purposes. Deleting a workspace permanently
        removes its associated application data, subject to backups and legal retention duties.
      </p>

      <h2>Your choices and rights</h2>
      <p>
        You can disconnect providers in Settings, revoke access directly in your Google or Twitch
        account, and delete a workspace if authorized. You may ask the operator to access, correct,
        export, or delete personal information. Applicable law may provide additional rights. Google
        permissions can be reviewed and revoked from your Google Account&apos;s third-party
        connections.
      </p>

      <h2>Cookies and similar technologies</h2>
      <p>
        GitchAlerts uses cookies or equivalent browser storage for authentication, security, OAuth
        linking state, and essential preferences. It does not include advertising cookies by
        default. An operator that adds analytics or other services must disclose those separately.
      </p>

      <h2>Children, international use, and changes</h2>
      <p>
        The service is not directed to children under 13, or the minimum age required in your
        country. Information may be processed where the operator and its providers run systems. We
        may update this policy as the service or law changes; the date above will be revised and
        material changes should be communicated through the service.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or privacy requests should be sent to {operator}
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
