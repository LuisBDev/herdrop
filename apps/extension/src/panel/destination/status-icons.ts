import { Activity, CircleAlert, CircleCheck, CircleDot, CircleQuestionMark } from 'lucide-solid';
import type { Component } from 'solid-js';
import type { StatusIcon } from './agents-view.ts';

export const STATUS_ICONS: Record<
  StatusIcon,
  Component<{ size?: number; 'aria-hidden'?: 'true' }>
> = {
  CircleDot,
  Activity,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
};
