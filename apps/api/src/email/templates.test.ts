import assert from 'node:assert/strict';
import test from 'node:test';

import { invitationMessage, magicLinkMessage } from './templates';

const input = {
  email: 'person@example.test', url: 'https://app.example.test/auth/verify?token=secret&next=project',
  expiresAt: '2026-10-05T16:30:00Z',
};

test('magic link has readable Russian text and HTML with account, expiry and unsolicited-mail guidance', () => {
  const message = magicLinkMessage(input);
  assert.equal(message.to, input.email);
  assert.equal(message.subject, 'Ссылка для входа в LYKAR');
  for (const part of [message.text, message.html]) {
    assert.ok(part.includes(input.email));
    assert.ok(part.includes('05.10.2026 в 16:30 UTC'));
    assert.ok(part.includes('только один раз'));
    assert.ok(part.includes('Если вы не запрашивали это письмо, проигнорируйте его.'));
  }
  assert.ok(message.text.includes(input.url));
  assert.ok(message.html.includes('href="https://app.example.test/auth/verify?token=secret&amp;next=project"'));
  assert.ok(!message.html.includes('<img'));
});

test('invitation contains project, translated role and account-specific acceptance context', () => {
  const message = invitationMessage({ ...input, projectName: 'Рабочий проект', role: 'editor' });
  assert.equal(message.subject, 'Приглашение в проект LYKAR');
  for (const part of [message.text, message.html]) {
    assert.ok(part.includes('Рабочий проект'));
    assert.ok(part.includes('редактор'));
    assert.ok(part.includes(input.email));
    assert.ok(part.includes('Для принятия войдите в аккаунт с этим адресом.'));
    assert.ok(part.includes('05.10.2026 в 16:30 UTC'));
    assert.ok(part.includes('Если вы не запрашивали это письмо, проигнорируйте его.'));
  }
});

test('all HTML data and link attributes are escaped, while plain text keeps readable literal data', () => {
  const email = `person+<'&\"@example.test`;
  const projectName = `<script>alert('x')</script> & "Проект"`;
  const role = '<img src=x onerror=alert(1)>';
  const url = "https://app.example.test/accept?token=x'&next=%22%3E%3Cscript%3E";
  const message = invitationMessage({ ...input, email, projectName, role, url });
  assert.ok(message.text.includes(projectName));
  assert.ok(message.html.includes('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;Проект&quot;'));
  assert.ok(message.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(message.html.includes('person+&lt;&#39;&amp;&quot;@example.test'));
  assert.ok(message.html.includes('href="https://app.example.test/accept?token=x%27&amp;next=%22%3E%3Cscript%3E"'));
  assert.ok(!message.html.includes('<script>'));
  assert.ok(!message.html.includes('<img'));
  assert.ok(!message.subject.includes(projectName));
  assert.ok(magicLinkMessage({ ...input, email }).html.includes('person+&lt;&#39;&amp;&quot;@example.test'));
});

test('only HTTP(S) links without userinfo or control characters are accepted', () => {
  for (const url of [
    'javascript:alert(1)', 'data:text/html,<script>', '/relative', 'https://user:secret@app.example.test/path',
    'https://user@app.example.test/path', 'https://app.example.test/path\nsecret',
  ]) {
    for (const create of [
      () => magicLinkMessage({ ...input, url }),
      () => invitationMessage({ ...input, url, projectName: 'Project', role: 'viewer' }),
    ]) {
      assert.throws(create, error => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'Invalid email link');
        assert.ok(!error.message.includes(url));
        return true;
      });
    }
  }
  assert.ok(magicLinkMessage({ ...input, url: 'http://localhost:5173/auth/verify?token=x' }).text.includes('http://localhost:5173'));
});

test('expiry accepts dates with explicit UTC rendering and rejects invalid input without exposing it', () => {
  assert.ok(magicLinkMessage({ ...input, expiresAt: new Date('2026-10-05T19:30:00+03:00') })
    .text.includes('05.10.2026 в 16:30 UTC'));
  assert.throws(() => magicLinkMessage({ ...input, expiresAt: 'private-token' }), /Invalid email link expiry/);
});
