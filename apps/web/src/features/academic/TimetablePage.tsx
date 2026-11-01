import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Printer, Settings2, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost, ApiFailure } from '@/lib/api';
import { useAuth } from '@/app/providers/auth';
import { useI18n } from '@/i18n/context';
import { useToast } from '@/components/ui/toast';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';
import type { TranslationKey } from '@/i18n';

export type Period = {
  id: string;
  academicYearId: string;
  periodNo: number;
  label: string;
  startTime: string;
  endTime: string;
  type: 'LESSON' | 'BREAK' | 'ASSEMBLY' | 'PRAYER' | 'ACTIVITY' | 'OTHER';
  isActive: boolean;
  sortOrder: number;
};

export type Entry = {
  id: string;
  classId: string;
  className: string;
  periodId: string;
  dayOfWeek: 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY';
  teacherId: string | null;
  teacherName: string | null;
  subjectId: string | null;
  subjectCode: string | null;
  subjectName: string | null;
  entryType: Period['type'];
  label: string | null;
  room: string | null;
};

type Matrix = { academicYearId: string; days: string[]; periods: Period[]; entries: Entry[] };
type Year = { id: string; name: string; isCurrent: boolean; status: string };
type ClassRow = { id: string; name: string; academicYearId: string };
type Staff = { id: string; fullName: string };
type AssignmentOption = { id: string; teacherName: string; subjectCode: string; subjectName: string };

const DAY_KEYS: Record<string, TranslationKey> = {
  SUNDAY: 'day.SUNDAY',
  MONDAY: 'day.MONDAY',
  TUESDAY: 'day.TUESDAY',
  WEDNESDAY: 'day.WEDNESDAY',
  THURSDAY: 'day.THURSDAY',
};

const TYPE_KEYS: Record<Period['type'], TranslationKey> = {
  LESSON: 'periodType.LESSON',
  BREAK: 'periodType.BREAK',
  ASSEMBLY: 'periodType.ASSEMBLY',
  PRAYER: 'periodType.PRAYER',
  ACTIVITY: 'periodType.ACTIVITY',
  OTHER: 'periodType.OTHER',
};

const hhmm = (t: string) => t.slice(0, 5);

/** Timetable workspace: class matrix, entry dialog, period management, print (§29–§36). */
export function TimetablePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = user?.permissions.includes('timetable.manage') ?? false;

  const [yearId, setYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [showPeriods, setShowPeriods] = useState(false);
  const [editing, setEditing] = useState<{ day: string; periodId: string; entry?: Entry } | null>(null);

  const years = useQuery({ queryKey: ['years'], queryFn: () => apiGet<{ data: Year[] }>('/academic-years') });
  const classes = useQuery({ queryKey: ['classes'], queryFn: () => apiGet<{ data: ClassRow[] }>('/classes') });

  const effectiveYear = yearId || years.data?.data.find((y) => y.isCurrent)?.id || '';
  const classOptions = useMemo(
    () => (classes.data?.data ?? []).filter((c) => !effectiveYear || c.academicYearId === effectiveYear),
    [classes.data, effectiveYear],
  );
  const effectiveClass = classId || classOptions[0]?.id || '';

  const view = useQuery({
    queryKey: ['timetable', 'class', effectiveClass, effectiveYear],
    queryFn: () => apiGet<Matrix & { className: string | null }>(`/timetable/classes/${effectiveClass}?academicYearId=${effectiveYear}`),
    enabled: Boolean(effectiveClass && effectiveYear),
  });

  const periods = view.data?.periods ?? [];
  const entries = view.data?.entries ?? [];
  const cellFor = (day: string, periodId: string) => entries.find((e) => e.dayOfWeek === day && e.periodId === periodId);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['timetable'] });
  };

  const removeEntry = useMutation({
    mutationFn: (id: string) => apiDelete(`/timetable/entries/${id}`),
    onSuccess: async () => {
      toast(t('timetable.entryDeleted'));
      await invalidate();
    },
    onError: (e: Error) => toast(conflictMessage(e, t), 'error'),
  });

  if (classes.isLoading || years.isLoading) return <LoadingState rows={4} />;
  if (classes.isError || years.isError) return <ErrorState onRetry={() => { classes.refetch(); years.refetch(); }} />;
  if (classOptions.length === 0) return <EmptyState message={t('timetable.noClasses')} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-2xl font-semibold">{t('timetable.title')}</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="sr-only">{t('timetable.year')}</span>
            <select className="input" value={effectiveYear} onChange={(e) => { setYearId(e.target.value); setClassId(''); }}>
              {(years.data?.data ?? []).map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="sr-only">{t('timetable.class')}</span>
            <select className="input" value={effectiveClass} onChange={(e) => setClassId(e.target.value)}>
              {classOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          {canManage && (
            <button className="btn-ghost" onClick={() => setShowPeriods((v) => !v)}>
              <Settings2 className="h-4 w-4" />
              {t('timetable.periods')}
            </button>
          )}
          <button className="btn-ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            {t('timetable.print')}
          </button>
        </div>
      </header>

      {showPeriods && canManage && (
        <PeriodManager yearId={effectiveYear} periods={periods} onChanged={invalidate} />
      )}

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">Portal SRIK — {view.data?.className ?? ''}</h2>
        <p className="text-sm">{years.data?.data.find((y) => y.id === effectiveYear)?.name}</p>
      </div>

      {view.isLoading ? (
        <LoadingState rows={6} />
      ) : view.isError ? (
        <ErrorState onRetry={() => view.refetch()} />
      ) : periods.length === 0 ? (
        <EmptyState message={t('timetable.noPeriods')} />
      ) : (
        <div className="card overflow-x-auto p-0 print:border-0 print:shadow-none">
          <table className="table timetable-grid text-xs print:text-[10px]">
            <thead>
              <tr>
                <th className="w-28">{t('timetable.period')}</th>
                {view.data!.days.map((d) => (
                  <th key={d}>{t(DAY_KEYS[d] ?? 'day.MONDAY')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="text-left">
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block text-[10px] font-normal text-slate-500">
                      {hhmm(p.startTime)}–{hhmm(p.endTime)}
                    </span>
                  </th>
                  {view.data!.days.map((d) => {
                    const entry = cellFor(d, p.id);
                    const isLesson = entry?.entryType === 'LESSON';
                    return (
                      <td key={`${d}-${p.id}`} className="align-top">
                        {entry ? (
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <p className="font-medium">{isLesson ? entry.subjectName : entry.label ?? t(TYPE_KEYS[entry.entryType])}</p>
                              {isLesson && <p className="text-[10px] text-slate-600">{entry.teacherName}</p>}
                              {entry.room && <p className="text-[10px] text-slate-500">{entry.room}</p>}
                            </div>
                            {canManage && (
                              <button
                                className="btn-ghost px-1 py-0.5 print:hidden"
                                aria-label={t('timetable.deleteEntry')}
                                onClick={() => removeEntry.mutate(entry.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ) : p.type === 'LESSON' && canManage ? (
                          <button
                            className="w-full rounded border border-dashed border-slate-300 px-1 py-2 text-[10px] text-slate-400 hover:border-brand-500 hover:text-brand-700 print:hidden"
                            onClick={() => setEditing({ day: d, periodId: p.id })}
                          >
                            + {t('timetable.addEntry')}
                          </button>
                        ) : p.type !== 'LESSON' ? (
                          <span className="text-[10px] text-slate-400 print:text-slate-600">{t(TYPE_KEYS[p.type])}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && canManage && (
        <EntryDialog
          classId={effectiveClass}
          yearId={effectiveYear}
          day={editing.day}
          periodId={editing.periodId}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await invalidate();
          }}
        />
      )}
    </div>
  );
}

function EntryDialog({
  classId,
  yearId,
  day,
  periodId,
  onClose,
  onSaved,
}: {
  classId: string;
  yearId: string;
  day: string;
  periodId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [assignmentId, setAssignmentId] = useState('');
  const [room, setRoom] = useState('');

  const options = useQuery({
    queryKey: ['timetable', 'assignment-options', yearId, classId],
    queryFn: () => apiGet<AssignmentOption[]>(`/timetable/assignment-options?academicYearId=${yearId}&classId=${classId}`),
  });

  const save = useMutation({
    mutationFn: () =>
      apiPost('/timetable/entries', {
        academicYearId: yearId,
        classId,
        periodId,
        dayOfWeek: day,
        teachingAssignmentId: assignmentId,
        entryType: 'LESSON',
        room: room || null,
      }),
    onSuccess: async () => {
      toast(t('timetable.entryCreated'));
      await onSaved();
    },
    onError: (e: Error) => toast(conflictMessage(e, t), 'error'),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
      <form
        className="card w-full max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="text-base font-semibold">{t('timetable.addEntry')}</h2>
        <p className="text-sm text-slate-600">
          {t(DAY_KEYS[day] ?? 'day.MONDAY')} · {t('timetable.period')}
        </p>
        <div>
          <label className="label" htmlFor="entry-assignment">
            {t('timetable.assignment')}
          </label>
          <select
            id="entry-assignment"
            className="input"
            required
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
          >
            <option value="">—</option>
            {(options.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.subjectCode} — {o.teacherName}
              </option>
            ))}
          </select>
          {options.data?.length === 0 && <p className="mt-1 text-xs text-amber-700">{t('timetable.noAssignments')}</p>}
        </div>
        <div>
          <label className="label" htmlFor="entry-room">
            {t('timetable.room')}
          </label>
          <input id="entry-room" className="input" maxLength={60} value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending || !assignmentId}>
            {t('app.save')}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('app.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}

function PeriodManager({ yearId, periods, onChanged }: { yearId: string; periods: Period[]; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost('/timetable/periods', body),
    onSuccess: async () => {
      toast(t('timetable.periodCreated'));
      await onChanged();
    },
    onError: (e: Error) => toast(conflictMessage(e, t), 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/timetable/periods/${id}`),
    onSuccess: async () => {
      toast(t('timetable.periodDeleted'));
      await onChanged();
    },
    onError: (e: Error) => toast(conflictMessage(e, t), 'error'),
  });

  return (
    <section className="card space-y-4 print:hidden">
      <h2 className="text-base font-semibold">{t('timetable.periodsTitle')}</h2>
      <form
        className="grid gap-3 sm:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          create.mutate({
            academicYearId: yearId,
            periodNo: Number(data.get('periodNo')),
            label: String(data.get('label')),
            startTime: String(data.get('startTime')),
            endTime: String(data.get('endTime')),
            type: String(data.get('type')),
          });
          e.currentTarget.reset();
        }}
      >
        <div>
          <label className="label" htmlFor="p-no">{t('timetable.periodNo')}</label>
          <input id="p-no" name="periodNo" type="number" min={1} max={30} required className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-label">{t('timetable.label')}</label>
          <input id="p-label" name="label" required maxLength={60} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="p-start">{t('timetable.start')}</label>
          <input id="p-start" name="startTime" type="time" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="p-end">{t('timetable.end')}</label>
          <input id="p-end" name="endTime" type="time" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="p-type">{t('timetable.type')}</label>
          <select id="p-type" name="type" className="input" defaultValue="LESSON">
            {(Object.keys(TYPE_KEYS) as Period['type'][]).map((k) => (
              <option key={k} value={k}>{t(TYPE_KEYS[k])}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-6">
          <button className="btn-primary" disabled={create.isPending}>{t('timetable.addPeriod')}</button>
        </div>
      </form>

      {periods.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>{t('timetable.periodNo')}</th>
              <th>{t('timetable.label')}</th>
              <th>{t('timetable.start')}</th>
              <th>{t('timetable.end')}</th>
              <th>{t('timetable.type')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td>{p.periodNo}</td>
                <td>{p.label}</td>
                <td>{hhmm(p.startTime)}</td>
                <td>{hhmm(p.endTime)}</td>
                <td>{t(TYPE_KEYS[p.type])}</td>
                <td>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => remove.mutate(p.id)}>
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function conflictMessage(
  e: Error,
  t: (k: 'timetable.classConflict' | 'timetable.teacherConflict' | 'timetable.roomConflict' | 'timetable.invalidAssignment' | 'timetable.yearClosed' | 'timetable.periodInUse' | 'app.error.forbidden' | 'app.error.server') => string,
) {
  if (e instanceof ApiFailure) {
    switch (e.error.code) {
      case 'TIMETABLE_CLASS_CONFLICT':
        return t('timetable.classConflict');
      case 'TIMETABLE_TEACHER_CONFLICT':
        return t('timetable.teacherConflict');
      case 'TIMETABLE_ROOM_CONFLICT':
        return t('timetable.roomConflict');
      case 'TIMETABLE_INVALID_ASSIGNMENT':
        return t('timetable.invalidAssignment');
      case 'TIMETABLE_YEAR_CLOSED':
        return t('timetable.yearClosed');
      case 'TIMETABLE_PERIOD_IN_USE':
        return t('timetable.periodInUse');
      case 'CLASS_SCOPE_DENIED':
      case 'FORBIDDEN':
        return t('app.error.forbidden');
      default:
        return e.error.message;
    }
  }
  return t('app.error.server');
}
