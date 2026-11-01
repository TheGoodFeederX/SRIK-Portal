import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { EmptyState, ErrorState, LoadingState } from '@/app/portfolios/DashboardPage';
import type { TranslationKey } from '@/i18n';

type Period = { id: string; periodNo: number; label: string; startTime: string; endTime: string; type: string };
type Entry = {
  id: string;
  classId: string;
  className: string;
  periodId: string;
  dayOfWeek: string;
  teacherName: string | null;
  subjectName: string | null;
  subjectCode: string | null;
  entryType: string;
  label: string | null;
  room: string | null;
};
type Matrix = { academicYearId: string; days: string[]; periods: Period[]; entries: Entry[] };

const DAY_KEYS: Record<string, TranslationKey> = {
  SUNDAY: 'day.SUNDAY',
  MONDAY: 'day.MONDAY',
  TUESDAY: 'day.TUESDAY',
  WEDNESDAY: 'day.WEDNESDAY',
  THURSDAY: 'day.THURSDAY',
};

const hhmm = (t: string) => t.slice(0, 5);

/** Teacher self timetable (spec v1.3 §31): own schedule only, read-only, printable. */
export function MyTimetablePage() {
  const { t } = useI18n();
  const view = useQuery({ queryKey: ['timetable', 'me'], queryFn: () => apiGet<Matrix>('/timetable/me') });

  if (view.isLoading) return <LoadingState rows={5} />;
  if (view.isError) return <ErrorState onRetry={() => view.refetch()} />;

  const data = view.data!;
  const cell = (day: string, periodId: string) => data.entries.find((e) => e.dayOfWeek === day && e.periodId === periodId);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">{t('timetable.mine')}</h1>
        <button className="btn-ghost" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          {t('timetable.print')}
        </button>
      </header>

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">{t('timetable.mine')} — Portal SRIK</h2>
      </div>

      {data.periods.length === 0 || data.entries.length === 0 ? (
        <EmptyState message={t('timetable.emptyMine')} />
      ) : (
        <div className="card overflow-x-auto p-0 print:border-0 print:shadow-none">
          <table className="table text-xs print:text-[10px]">
            <thead>
              <tr>
                <th className="w-28">{t('timetable.period')}</th>
                {data.days.map((d) => (
                  <th key={d}>{t(DAY_KEYS[d] ?? 'day.MONDAY')}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.periods.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="text-left">
                    <span className="block font-semibold">{p.label}</span>
                    <span className="block text-[10px] font-normal text-slate-500">
                      {hhmm(p.startTime)}–{hhmm(p.endTime)}
                    </span>
                  </th>
                  {data.days.map((d) => {
                    const entry = cell(d, p.id);
                    return (
                      <td key={`${d}-${p.id}`} className="align-top">
                        {entry ? (
                          <>
                            <p className="font-medium">{entry.className}</p>
                            <p className="text-[10px] text-slate-600">{entry.subjectName ?? entry.label}</p>
                            {entry.room && <p className="text-[10px] text-slate-500">{entry.room}</p>}
                          </>
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
    </div>
  );
}
