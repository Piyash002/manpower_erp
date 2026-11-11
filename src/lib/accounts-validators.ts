import { z } from 'zod';

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] as const;
export const JOURNAL_TYPES = ['JV', 'RV', 'PV', 'CV'] as const;

export const createAccountSchema = z.object({
  code: z.string().trim().min(2, 'Account code is required').max(20),
  name: z.string().trim().min(2, 'Account name is required').max(120),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().trim().nullable().optional(),
  isGroup: z.boolean().default(false),
  description: z.string().trim().max(300).optional(),
  active: z.boolean().default(true),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  parentId: z.string().trim().nullable().optional(),
  description: z.string().trim().max(300).optional(),
  active: z.boolean().optional(),
});

export const journalLineInputSchema = z
  .object({
    accountId: z.string().trim().min(1, 'Account is required'),
    description: z.string().trim().max(250).optional(),
    debitPaisa: z.number().int().min(0),
    creditPaisa: z.number().int().min(0),
    branch: z.string().trim().min(1).max(80).default('Main'),
    department: z.string().trim().min(1).max(80).default('General'),
    studentId: z.string().trim().nullable().optional(),
    employeeId: z.string().trim().nullable().optional(),
    agentId: z.string().trim().nullable().optional(),
    vendorId: z.string().trim().nullable().optional(),
  })
  .refine((l) => (l.debitPaisa > 0 && l.creditPaisa === 0) || (l.creditPaisa > 0 && l.debitPaisa === 0), {
    message: 'Each line must have either Debit > 0 or Credit > 0 (not both, and not zero).',
  });

export const createJournalEntrySchema = z.object({
  journalType: z.enum(JOURNAL_TYPES),
  entryDate: z.string().trim().min(1, 'Entry date is required'),
  description: z.string().trim().min(2, 'Description is required').max(400),
  reference: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().trim().max(160).optional(),
  postImmediately: z.boolean().default(false),
  lines: z.array(journalLineInputSchema).min(2, 'At least 2 balanced lines are required'),
});

export const entryActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_draft'),
    entryDate: z.string().trim().min(1),
    description: z.string().trim().min(2).max(400),
    reference: z.string().trim().max(120).optional(),
    lines: z.array(journalLineInputSchema).min(2),
  }),
  z.object({
    action: z.literal('post'),
  }),
  z.object({
    action: z.literal('reverse'),
    reason: z.string().trim().min(3, 'Reversal reason (minimum 3 characters) is required').max(300),
    reversalDate: z.string().trim().optional(),
  }),
]);

export const openingBalanceSchema = z.object({
  asOfDate: z.string().trim().min(1, 'As-of date is required'),
  description: z.string().trim().max(300).optional(),
  autoBalanceWithEquity: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        accountId: z.string().trim().min(1),
        debitPaisa: z.number().int().min(0),
        creditPaisa: z.number().int().min(0),
        branch: z.string().trim().default('Main'),
        department: z.string().trim().default('General'),
      })
    )
    .min(1, 'At least one opening balance line is required'),
});

export const createFiscalYearSchema = z.object({
  year: z.number().int().min(2020).max(2099),
});

export const periodLockSchema = z.object({
  periodId: z.string().trim().min(1, 'periodId is required'),
  action: z.enum(['lock', 'unlock']),
  reason: z.string().trim().min(3, 'Reason (minimum 3 characters) is required').max(300),
});

