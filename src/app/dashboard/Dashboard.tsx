'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  LogOut,
  Upload,
  Code,
  Send,
  Paperclip,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Image as ImageIcon,
  Eye,
} from 'lucide-react';

interface SafeAccount {
  id: string;
  name: string;
  domain: string;
  from: string;
}

interface SendLogEntry {
  id: string;
  recipient: string;
  subject: string;
  mailgunAccountId: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

type HtmlMode = 'upload' | 'paste';

export default function Dashboard() {
  const router = useRouter();
  
  // Accounts
  const [accounts, setAccounts] = useState<SafeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Email fields
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');

  // HTML content
  const [htmlMode, setHtmlMode] = useState<HtmlMode>('upload');
  const [htmlContent, setHtmlContent] = useState('');
  const [htmlFileName, setHtmlFileName] = useState('');
  const [pastedHtml, setPastedHtml] = useState('');

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Attachments
  const [attachments, setAttachments] = useState<File[]>([]);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // History
  const [history, setHistory] = useState<SendLogEntry[]>([]);

  // Refs
  const htmlInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Load accounts
  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) {
          setAccounts(data.accounts);
          if (data.accounts.length > 0) {
            setSelectedAccountId(data.accounts[0].id);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Load history
  const loadHistory = useCallback(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data) => {
        if (data.logs) setHistory(data.logs);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Get current HTML content for preview/send
  const currentHtml = htmlMode === 'upload' ? htmlContent : pastedHtml;

  // Update preview
  useEffect(() => {
    if (showPreview && iframeRef.current && currentHtml) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(currentHtml);
        doc.close();
      }
    }
  }, [showPreview, currentHtml]);

  // Handle HTML file upload
  function handleHtmlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'html' && ext !== 'htm') {
      setSendResult({ type: 'error', message: 'Only .html and .htm files are allowed.' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setSendResult({ type: 'error', message: 'HTML file must be under 2MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!/<[a-z][\s\S]*>/i.test(content)) {
        setSendResult({ type: 'error', message: 'File does not appear to contain valid HTML.' });
        return;
      }
      setHtmlContent(content);
      setHtmlFileName(file.name);
      setShowPreview(true);
      setSendResult(null);
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-selected
    e.target.value = '';
  }

  // Handle attachment upload
  function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const allowed = ['.pdf', '.png', '.jpg', '.jpeg'];
    const newAttachments: File[] = [];

    for (const file of Array.from(files)) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowed.includes(ext)) {
        setSendResult({ type: 'error', message: `"${file.name}" is not a supported file type. Use PDF, PNG, or JPG.` });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setSendResult({ type: 'error', message: `"${file.name}" exceeds the 10MB attachment limit.` });
        return;
      }
      newAttachments.push(file);
    }

    const combined = [...attachments, ...newAttachments];
    if (combined.length > 5) {
      setSendResult({ type: 'error', message: 'Maximum 5 attachments allowed.' });
      return;
    }

    setAttachments(combined);
    setSendResult(null);
    e.target.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  // Send email
  async function handleSend() {
    setSendResult(null);

    if (!selectedAccountId) {
      setSendResult({ type: 'error', message: 'Please select a Mailgun account.' });
      return;
    }
    if (!recipient) {
      setSendResult({ type: 'error', message: 'Please enter a recipient email.' });
      return;
    }
    if (!subject) {
      setSendResult({ type: 'error', message: 'Please enter a subject.' });
      return;
    }
    if (!currentHtml) {
      setSendResult({ type: 'error', message: 'Please upload or paste HTML content.' });
      return;
    }

    setSending(true);

    try {
      const formData = new FormData();
      formData.append('accountId', selectedAccountId);
      formData.append('recipient', recipient);
      formData.append('subject', subject);
      formData.append('htmlContent', currentHtml);
      if (htmlMode === 'upload' && htmlFileName) {
        formData.append('htmlFileName', htmlFileName);
      }
      for (const file of attachments) {
        formData.append('attachments', file);
      }

      const res = await fetch('/api/send', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSendResult({ type: 'success', message: data.message || 'Email sent successfully!' });
        // Reset form
        setRecipient('');
        setSubject('');
        setHtmlContent('');
        setHtmlFileName('');
        setPastedHtml('');
        setAttachments([]);
        setShowPreview(false);
        loadHistory();
      } else {
        setSendResult({ type: 'error', message: data.error || 'Failed to send email.' });
        loadHistory();
      }
    } catch {
      setSendResult({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getAccountDomain(accountId: string) {
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.domain || `Account ${accountId}`;
  }

  function getAttachmentIcon(name: string) {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileText size={14} />;
    return <ImageIcon size={14} />;
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <Mail size={20} strokeWidth={1.5} />
            <span>HTML Email Sender</span>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.push('/login');
              router.refresh();
            }}
            className="btn-logout"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        {/* Compose Card */}
        <section className="card compose-card">
          <h2 className="card-title">Send HTML Email</h2>

          {/* Result Toast */}
          {sendResult && (
            <div className={`toast toast-${sendResult.type}`}>
              {sendResult.type === 'success' ? (
                <CheckCircle2 size={18} />
              ) : (
                <XCircle size={18} />
              )}
              <span>{sendResult.message}</span>
              <button onClick={() => setSendResult(null)} className="toast-close">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Account Selector */}
          <div className="field">
            <label htmlFor="account">Mailgun Account</label>
            <select
              id="account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {acc.domain}
                </option>
              ))}
            </select>
          </div>

          {/* Recipient */}
          <div className="field">
            <label htmlFor="recipient">To</label>
            <input
              id="recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          {/* Subject */}
          <div className="field">
            <label htmlFor="subject">Subject</label>
            <input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
            />
          </div>

          {/* HTML Content */}
          <div className="field">
            <label>HTML Content</label>
            <div className="html-mode-tabs">
              <button
                className={`tab-btn ${htmlMode === 'upload' ? 'active' : ''}`}
                onClick={() => setHtmlMode('upload')}
              >
                <Upload size={14} />
                Upload HTML
              </button>
              <button
                className={`tab-btn ${htmlMode === 'paste' ? 'active' : ''}`}
                onClick={() => setHtmlMode('paste')}
              >
                <Code size={14} />
                Paste HTML
              </button>
            </div>

            {htmlMode === 'upload' ? (
              <div className="upload-area">
                <input
                  ref={htmlInputRef}
                  type="file"
                  accept=".html,.htm"
                  onChange={handleHtmlUpload}
                  style={{ display: 'none' }}
                />
                {htmlFileName ? (
                  <div className="file-badge">
                    <FileText size={16} />
                    <span>{htmlFileName}</span>
                    <button
                      onClick={() => htmlInputRef.current?.click()}
                      className="btn-link"
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => {
                        setHtmlContent('');
                        setHtmlFileName('');
                        setShowPreview(false);
                      }}
                      className="btn-link danger"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => htmlInputRef.current?.click()}
                    className="btn-upload"
                  >
                    <Upload size={18} />
                    <span>Choose HTML file</span>
                    <span className="upload-hint">.html or .htm, max 2MB</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="paste-area">
                <textarea
                  value={pastedHtml}
                  onChange={(e) => {
                    setPastedHtml(e.target.value);
                    if (e.target.value && showPreview) {
                      // Preview will update via effect
                    }
                  }}
                  placeholder="<html>&#10;  <body>&#10;    <h1>Your email content</h1>&#10;  </body>&#10;</html>"
                  rows={10}
                  spellCheck={false}
                />
              </div>
            )}

            {/* Preview toggle */}
            {currentHtml && (
              <button
                className="btn-preview"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye size={14} />
                {showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
            )}
          </div>

          {/* HTML Preview */}
          {showPreview && currentHtml && (
            <div className="preview-container">
              <div className="preview-label">HTML Preview</div>
              <iframe
                ref={iframeRef}
                sandbox="allow-same-origin"
                title="HTML Preview"
                className="preview-iframe"
              />
            </div>
          )}

          {/* Attachments */}
          <div className="field">
            <label>Attachments <span className="label-hint">(optional)</span></label>
            <input
              ref={attachInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              multiple
              onChange={handleAttachmentUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => attachInputRef.current?.click()}
              className="btn-attach"
            >
              <Paperclip size={14} />
              Add PDF / Image
            </button>

            {attachments.length > 0 && (
              <ul className="attachment-list">
                {attachments.map((file, i) => (
                  <li key={i} className="attachment-item">
                    {getAttachmentIcon(file.name)}
                    <span className="attachment-name">{file.name}</span>
                    <span className="attachment-size">{formatFileSize(file.size)}</span>
                    <button onClick={() => removeAttachment(i)} className="attachment-remove">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={sending}
            className="btn-send"
          >
            {sending ? (
              <>
                <Loader2 size={18} className="spinner" />
                Sending…
              </>
            ) : (
              <>
                <Send size={18} />
                Send Email
              </>
            )}
          </button>
        </section>

        {/* History Card */}
        {history.length > 0 && (
          <section className="card history-card">
            <h2 className="card-title">Recent Emails</h2>
            <div className="table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Account</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((log) => (
                    <tr key={log.id}>
                      <td className="cell-time">{formatTime(log.createdAt)}</td>
                      <td className="cell-recipient">{log.recipient}</td>
                      <td className="cell-subject">{log.subject}</td>
                      <td className="cell-account">{getAccountDomain(log.mailgunAccountId)}</td>
                      <td>
                        <span className={`status-badge ${log.status === 'Sent' ? 'status-sent' : 'status-failed'}`}>
                          {log.status === 'Sent' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
