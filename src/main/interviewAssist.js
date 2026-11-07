const GLOSSARY = {
  SIEM: [
    'Security Information and Event Management',
    'Collects and correlates security logs to detect threats.'
  ],
  SOC: [
    'Security Operations Center',
    'The team and processes monitoring and responding to security incidents.'
  ],
  SOAR: [
    'Security Orchestration, Automation and Response',
    'Automates security workflows and incident response.'
  ],
  EDR: ['Endpoint Detection and Response', 'Detects and investigates suspicious activity on endpoints.'],
  XDR: [
    'Extended Detection and Response',
    'Correlates threats across endpoints, networks, identity and cloud.'
  ],
  IAM: ['Identity and Access Management', 'Controls who can access which resources.'],
  PAM: ['Privileged Access Management', 'Protects and audits powerful administrative accounts.'],
  MFA: ['Multi-Factor Authentication', 'Requires independent factors to verify identity.'],
  SSO: ['Single Sign-On', 'One authentication session grants access to multiple applications.'],
  OAuth: ['OAuth', 'Delegates access using scoped tokens; it is not itself an authentication protocol.'],
  OIDC: ['OpenID Connect', 'An identity layer on OAuth 2.0 for authentication.'],
  SAML: ['Security Assertion Markup Language', 'Exchanges signed identity assertions for federated login.'],
  JWT: ['JSON Web Token', 'A token carrying claims; signing does not encrypt its contents.'],
  TLS: ['Transport Layer Security', 'Authenticates connections and encrypts data in transit.'],
  PKI: ['Public Key Infrastructure', 'Manages certificates and trust for public-key cryptography.'],
  CVE: ['Common Vulnerabilities and Exposures', 'A public identifier for a disclosed vulnerability.'],
  CVSS: ['Common Vulnerability Scoring System', 'Rates vulnerability severity, not the full business risk.'],
  CWE: ['Common Weakness Enumeration', 'A classification of software and hardware weakness types.'],
  OWASP: [
    'Open Worldwide Application Security Project',
    'Publishes application-security guidance, including the Top 10.'
  ],
  DLP: ['Data Loss Prevention', 'Detects and restricts inappropriate disclosure of sensitive data.'],
  WAF: ['Web Application Firewall', 'Filters HTTP traffic to help protect web applications.'],
  IDS: ['Intrusion Detection System', 'Monitors activity and alerts on suspected intrusions.'],
  IPS: ['Intrusion Prevention System', 'Detects and actively blocks suspected intrusions.'],
  IOC: ['Indicator of Compromise', 'Evidence suggesting a system may have been compromised.'],
  TTP: ['Tactics, Techniques and Procedures', 'Patterns describing adversary goals and behavior.'],
  APT: ['Advanced Persistent Threat', 'A capable adversary conducting sustained, targeted operations.'],
  RCE: ['Remote Code Execution', 'An attacker can execute code on a remote system.'],
  XSS: ['Cross-Site Scripting', "Untrusted script executes in another user's browser context."],
  CSRF: ['Cross-Site Request Forgery', 'Tricks an authenticated browser into sending unwanted requests.'],
  SSRF: ['Server-Side Request Forgery', 'Tricks a server into making attacker-controlled requests.'],
  SQLi: ['SQL Injection', 'Untrusted input changes the meaning of a database query.'],
  SAST: ['Static Application Security Testing', 'Analyzes source or compiled code for security weaknesses.'],
  DAST: ['Dynamic Application Security Testing', 'Tests a running application from the outside.'],
  SBOM: ['Software Bill of Materials', 'An inventory of software components and dependencies.'],
  RBAC: ['Role-Based Access Control', 'Grants permissions through roles assigned to users or services.'],
  ABAC: [
    'Attribute-Based Access Control',
    'Decides access using attributes of users, resources and context.'
  ],
  IDOR: [
    'Insecure Direct Object Reference',
    "Missing authorization lets a user access another user's object by changing its identifier."
  ],
  BOLA: [
    'Broken Object Level Authorization',
    'An API fails to check whether a caller may access a specific object.'
  ],
  ZTNA: [
    'Zero Trust Network Access',
    'Grants narrowly scoped application access after identity and context checks.'
  ],
  SASE: [
    'Secure Access Service Edge',
    'Combines wide-area networking with cloud-delivered security controls.'
  ],
  CASB: ['Cloud Access Security Broker', 'Enforces security policies between users and cloud services.'],
  CSPM: ['Cloud Security Posture Management', 'Finds cloud configuration weaknesses and policy violations.'],
  CNAPP: [
    'Cloud-Native Application Protection Platform',
    'Combines posture, workload and other cloud-security capabilities.'
  ],
  HMAC: [
    'Hash-based Message Authentication Code',
    'Uses a shared secret and a hash to verify message integrity and authenticity.'
  ],
  AES: [
    'Advanced Encryption Standard',
    'A symmetric block cipher; secure use also requires an appropriate mode and key management.'
  ],
  RSA: [
    'Rivest-Shamir-Adleman',
    'A public-key cryptographic algorithm used with secure padding for signatures or encryption.'
  ],
  'MITRE ATT&CK': [
    'MITRE ATT&CK',
    'A knowledge base of adversary tactics and techniques based on real observations.'
  ],
  infosec: ['Information security', 'Protects information confidentiality, integrity and availability.'],
  phishing: [
    'Phishing',
    'Deceptive messages trick people into disclosing information or taking unsafe actions.'
  ],
  ransomware: ['Ransomware', 'Malware or extortion that denies access to data or threatens its disclosure.'],
  'penetration testing': [
    'Penetration testing',
    'An authorized assessment that validates exploitable weaknesses within an agreed scope.'
  ],
  'zero trust': ['Zero trust', 'Verify access explicitly, use least privilege and assume breach.'],
  'least privilege': ['Least privilege', 'Grant only the permissions needed, for only as long as needed.'],
  'threat modeling': [
    'Threat modeling',
    'Identify threats, trust boundaries and mitigations before or during design.'
  ],
  'defense in depth': [
    'Defense in depth',
    'Use independent layers of protection so one failure is not decisive.'
  ],
  'lateral movement': [
    'Lateral movement',
    'An attacker moves between systems after gaining an initial foothold.'
  ],
  'prompt injection': [
    'Prompt injection',
    "Untrusted content attempts to override an AI system's instructions."
  ]
};

function extractJargon(text = '') {
  return Object.entries(GLOSSARY).flatMap(([term, [expansion, meaning]]) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text) ? [{ term, expansion, meaning }] : [];
  });
}

function isInterviewQuestion(text = '', previousText = '') {
  const clean = text.trim();
  if (clean.split(/\s+/).length < 3 && !/\?\s*$/.test(clean)) return false;
  if (!/[a-z0-9]/i.test(clean)) return false;
  if (!clean.includes('?') && /^(?:i |we |let me |let us |let's )/i.test(clean)) return false;
  const prompt =
    /\b(?:tell (?:me|us) about|walk (?:me|us) through|explain|describe|compare|give (?:me|us) an example|design|implement|how (?:would|do|does|did|can)|what(?:'s| is| are| would| do| does| did)|why (?:is|are|would|do|did)|(?:where|when|who|which) (?:is|are|would|do|does|did)|(?:can|could|would|do|did|are|have) you|what about)\b/i;
  if (prompt.test(clean)) return true;
  if (/\?\s*$/.test(clean)) return true;
  return (
    /\b(?:can you|could you|tell me|explain|describe)\s*$/i.test(previousText.trim()) &&
    clean.split(/\s+/).length >= 3
  );
}

function speakerLabel(segment) {
  return (
    segment.speakerName ||
    (segment.speakerId
      ? `Speaker ${segment.speakerId.replace('speaker_', '')}`
      : segment.speaker === 'me'
        ? 'Candidate (estimated)'
        : 'Other speaker (unidentified)')
  );
}

module.exports = { extractJargon, isInterviewQuestion, speakerLabel };
