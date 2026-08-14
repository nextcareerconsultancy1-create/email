import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getMailgunAccountById } from '@/lib/mailgun';
import { convert } from 'html-to-text';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';

// Rate limiting: simple in-memory store (per-process)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 20; // max sends per window
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// File size limits
const MAX_HTML_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB per attachment
const MAX_ATTACHMENTS = 5;
const ALLOWED_ATTACHMENT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 320;
}

function isValidHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limit
    if (!checkRateLimit(session.userId)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // 3. Parse form data
    const formData = await request.formData();
    const accountId = formData.get('accountId') as string;
    const recipient = formData.get('recipient') as string;
    const subject = formData.get('subject') as string;
    const htmlContent = formData.get('htmlContent') as string;
    const htmlFileName = (formData.get('htmlFileName') as string) || null;

    // 4. Validate required fields
    if (!accountId || !recipient || !subject || !htmlContent) {
      return NextResponse.json(
        { error: 'Missing required fields: accountId, recipient, subject, htmlContent' },
        { status: 400 }
      );
    }

    // 5. Validate email
    if (!validateEmail(recipient)) {
      return NextResponse.json(
        { error: 'Invalid recipient email address.' },
        { status: 400 }
      );
    }

    // 6. Validate subject
    if (subject.length > 998) {
      return NextResponse.json(
        { error: 'Subject line is too long.' },
        { status: 400 }
      );
    }

    // 7. Validate HTML
    if (htmlContent.length > MAX_HTML_SIZE) {
      return NextResponse.json(
        { error: 'HTML content exceeds maximum size of 2MB.' },
        { status: 400 }
      );
    }

    if (!isValidHtml(htmlContent)) {
      return NextResponse.json(
        { error: 'The provided content does not appear to be valid HTML.' },
        { status: 400 }
      );
    }

    // 8. Get Mailgun account
    const account = getMailgunAccountById(accountId);
    if (!account) {
      return NextResponse.json(
        { error: 'Invalid Mailgun account selected.' },
        { status: 400 }
      );
    }

    // 9. Generate plain text alternative
    const textContent = convert(htmlContent, {
      wordwrap: 80,
      selectors: [
        { selector: 'img', format: 'skip' },
        { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      ],
    });

    // 10. Build Mailgun form data
    const messageData: any = {
      from: account.from,
      to: recipient,
      subject: subject,
      html: htmlContent,
      text: textContent,
      attachment: []
    };

    // 11. Handle attachments
    const allFormEntries = formData.getAll('attachments');

    if (allFormEntries.length > MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ATTACHMENTS} attachments allowed.` },
        { status: 400 }
      );
    }

    for (const entry of allFormEntries) {
      if (entry instanceof File && entry.size > 0) {
        if (entry.size > MAX_ATTACHMENT_SIZE) {
          return NextResponse.json(
            { error: `Attachment "${entry.name}" exceeds the 10MB size limit.` },
            { status: 400 }
          );
        }

        const ext = '.' + entry.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
          return NextResponse.json(
            { error: `Attachment "${entry.name}" has an unsupported file type. Allowed: PDF, PNG, JPG.` },
            { status: 400 }
          );
        }

        const buffer = Buffer.from(await entry.arrayBuffer());
        messageData.attachment.push({
          data: buffer,
          filename: entry.name,
          contentType: entry.type || 'application/octet-stream',
        });
      }
    }

    if (messageData.attachment.length === 0) {
      delete messageData.attachment;
    }

    // 12. Send via Mailgun API
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({ username: 'api', key: account.apiKey });

    try {
      const mgResult = await mg.messages.create(account.domain, messageData);
      
      await prisma.sendLog.create({
        data: {
          userId: session.userId,
          mailgunAccountId: accountId,
          recipient,
          subject,
          filename: htmlFileName,
          status: 'Sent',
          mailgunMessageId: mgResult.id || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Email sent successfully.',
        messageId: mgResult.id,
      });
    } catch (mgError: any) {
      const safeError = mgError.message || 'Failed to send email via Mailgun.';

      await prisma.sendLog.create({
        data: {
          userId: session.userId,
          mailgunAccountId: accountId,
          recipient,
          subject,
          filename: htmlFileName,
          status: 'Failed',
          errorMessage: safeError.substring(0, 500),
        },
      });

      return NextResponse.json(
        { error: safeError },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Send email error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'An unexpected error occurred while sending the email.' },
      { status: 500 }
    );
  }
}
