import { describe, expect, it } from 'vitest';
import type { Intent, Rejection } from '../draft/model.ts';
import {
  counterText,
  editNote,
  type NoteDraft,
  newNote,
  noteHeading,
  pillState,
  pillText,
  rejectionText,
  validate,
} from './note-state.ts';

describe('note state', () => {
  it('pill_state_and_text', () => {
    const edited = editNote({ id: 'a1', intent: 'fix', priority: 'blocking', comment: 'Broken' });
    const cases: [NoteDraft, string, string][] = [
      [newNote(), 'empty', 'Empty'],
      [{ ...newNote(), comment: '  ' }, 'empty', 'Empty'],
      [{ ...newNote(), comment: 'Tighten' }, 'unsaved', 'Unsaved'],
      [{ ...newNote(), intent: 'fix' }, 'unsaved', 'Unsaved'],
      [{ ...newNote(), priority: 'important' }, 'unsaved', 'Unsaved'],
      [{ ...edited, comment: 'Broken badly' }, 'unsaved_changes', 'Unsaved changes'],
      [{ ...edited, priority: null }, 'unsaved_changes', 'Unsaved changes'],
      [{ ...edited, intent: 'change' }, 'unsaved_changes', 'Unsaved changes'],
      [edited, 'clean', ''],
    ];
    for (const [note, state, text] of cases) {
      expect(pillState(note)).toBe(state);
      expect(pillText(pillState(note))).toBe(text);
    }
    expect(edited.showPriority).toBe(true);
  });

  it('validation_rejection_and_counter_texts', () => {
    const withComment = (intent: Intent, comment: string): NoteDraft => ({
      ...newNote(),
      intent,
      comment,
    });
    expect(validate(withComment('fix', ' '))).toBe('Describe what is broken');
    expect(validate(withComment('change', ''))).toBe('Describe what should change');
    expect(validate(withComment('question', ''))).toBe('Write your question');
    expect(validate(withComment('approve', ''))).toBeNull();
    expect(validate(withComment('change', 'ok'))).toBeNull();
    expect(validate(withComment('change', 'x'.repeat(2000)))).toBeNull();
    expect(validate(withComment('change', 'x'.repeat(2001)))).toBe(
      'Keep it under 2,000 characters',
    );

    const rejections: [Rejection, string][] = [
      ['comment_required', 'Write your question'],
      ['comment_too_long', 'Keep it under 2,000 characters'],
      ['wrong_phase', 'The draft is locked while the drop runs'],
      ['not_found', 'This annotation was deleted'],
      ['stale_drop', 'Could not save the annotation'],
    ];
    for (const [reason, text] of rejections) {
      expect(rejectionText(reason, 'question')).toBe(text);
    }

    expect(counterText('x'.repeat(1599))).toBe('');
    expect(counterText('x'.repeat(1600))).toBe('1600 / 2000');
  });

  it('heading_strips_tag_from_label', () => {
    expect(
      noteHeading({
        component: null,
        elementTag: 'button.btn-primary',
        elementLabel: 'button.btn-primary button “New invoice”',
      }),
    ).toEqual({
      title: 'No component detected',
      tag: 'button.btn-primary',
      detail: 'button “New invoice”',
    });
    expect(
      noteHeading({ component: 'Toolbar', elementTag: 'nav', elementLabel: 'nav' }).title,
    ).toBe('Toolbar');
  });
});
