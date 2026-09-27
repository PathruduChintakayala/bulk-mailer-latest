import { useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import type { EditorIssue } from './ReviewTab';
import type { MergeFieldDefinition } from '../../types';

/**
 * Hook that computes editor validation issues in real-time.
 * Returns a reactive list of EditorIssue objects.
 */
export function useEditorValidation(
  editor: Editor | null,
  options: {
    subject?: string;
    preheader?: string;
    mergeFields?: MergeFieldDefinition[];
    editorContext?: 'campaign' | 'template';
    htmlBody?: string;
  }
): EditorIssue[] {
  const { subject = '', preheader = '', mergeFields = [], editorContext, htmlBody = '' } = options;

  return useMemo(() => {
    const issues: EditorIssue[] = [];
    const html = htmlBody || editor?.getHTML() || '';

    // ─── Blocking Errors ──────────────────────────────────────────
    if (editorContext === 'campaign' && !subject.trim()) {
      issues.push({
        id: 'empty-subject',
        severity: 'error',
        code: 'EMPTY_SUBJECT',
        title: 'Subject line is empty',
        description: 'A subject is required to send',
        fieldPath: 'subject',
        actionLabel: 'Add subject',
      });
    }

    // Check for unknown merge fields
    const fieldPattern = /\{\{(\w+)\}\}/g;
    const knownKeys = new Set(mergeFields.map(f => f.key));
    let match;
    const unknownFields = new Set<string>();

    // Check in subject
    while ((match = fieldPattern.exec(subject)) !== null) {
      if (knownKeys.size > 0 && !knownKeys.has(match[1])) {
        unknownFields.add(match[1]);
      }
    }
    // Check in preheader
    fieldPattern.lastIndex = 0;
    while ((match = fieldPattern.exec(preheader)) !== null) {
      if (knownKeys.size > 0 && !knownKeys.has(match[1])) {
        unknownFields.add(match[1]);
      }
    }
    // Check in HTML body
    fieldPattern.lastIndex = 0;
    while ((match = fieldPattern.exec(html)) !== null) {
      if (knownKeys.size > 0 && !knownKeys.has(match[1])) {
        unknownFields.add(match[1]);
      }
    }

    for (const fieldKey of unknownFields) {
      issues.push({
        id: `unknown-field-${fieldKey}`,
        severity: 'error',
        code: 'UNKNOWN_MERGE_FIELD',
        title: `Unknown merge field: {{${fieldKey}}}`,
        description: 'This field is not mapped to any data source',
        mergeFieldKey: fieldKey,
        actionLabel: 'Fix mapping',
      });
    }

    // Check for empty buttons (CTA with no URL)
    const buttonMatches = html.match(/href="(|#|undefined|null)"/g);
    if (buttonMatches && buttonMatches.length > 0) {
      issues.push({
        id: 'empty-button-url',
        severity: 'error',
        code: 'EMPTY_BUTTON_URL',
        title: `${buttonMatches.length} button(s) with empty or invalid URL`,
        fieldPath: 'body',
        actionLabel: 'Fix buttons',
      });
    }

    // ─── Warnings ─────────────────────────────────────────────────
    if (editorContext === 'campaign' && !preheader.trim()) {
      issues.push({
        id: 'empty-preheader',
        severity: 'warning',
        code: 'EMPTY_PREHEADER',
        title: 'Preheader text is empty',
        description: 'Inbox will show body content as preview',
        fieldPath: 'preheader',
        actionLabel: 'Add preheader',
      });
    }

    // Check images without alt text
    const imgTags = html.match(/<img[^>]*>/g) || [];
    const missingAlt = imgTags.filter(img => !img.match(/alt="[^"]+"/));
    if (missingAlt.length > 0) {
      issues.push({
        id: 'missing-img-alt',
        severity: 'warning',
        code: 'MISSING_IMG_ALT',
        title: `${missingAlt.length} image(s) without alt text`,
        description: 'Alt text improves accessibility and displays when images are blocked',
        fieldPath: 'body',
        actionLabel: 'Add alt text',
      });
    }

    // Subject length warning
    if (subject.length > 60) {
      issues.push({
        id: 'long-subject',
        severity: 'warning',
        code: 'LONG_SUBJECT',
        title: 'Subject may be truncated',
        description: `${subject.length} characters — may be cut off on mobile`,
        fieldPath: 'subject',
      });
    }

    // ─── Informational ────────────────────────────────────────────
    // Message size estimate
    const sizeKB = Math.round(new Blob([html]).size / 1024);
    if (sizeKB > 100) {
      issues.push({
        id: 'large-message',
        severity: 'warning',
        code: 'LARGE_MESSAGE',
        title: `Message is ${sizeKB}KB`,
        description: 'Large emails may be clipped by some email clients',
        fieldPath: 'body',
      });
    } else {
      issues.push({
        id: 'message-size',
        severity: 'info',
        code: 'MESSAGE_SIZE',
        title: `Message size: ~${sizeKB}KB`,
      });
    }

    // Field count
    const allFields = new Set<string>();
    fieldPattern.lastIndex = 0;
    let m;
    while ((m = fieldPattern.exec(html)) !== null) allFields.add(m[1]);
    if (allFields.size > 0) {
      issues.push({
        id: 'field-count',
        severity: 'info',
        code: 'FIELD_COUNT',
        title: `${allFields.size} personalization field(s) used`,
      });
    }

    return issues;
  }, [editor, subject, preheader, mergeFields, editorContext, htmlBody]);
}
