/**
 * Dashboard — diploma overview tab.
 *  Health bar             : ML service status
 *  Dataset card           : upload zone + Kaggle ULB stats
 *  Training panel         : live status + log tail (auto-polled)
 *  Model cards            : LogReg + NN metrics with confusion matrix
 *  Top correlations       : bars
 */

import { useEffect, useRef, useState } from 'react';

import {
  useDatasetInfo,
  useMlHealth,
  useMlMetrics,
  useMlRetrain,
  useTrainStatus,
  useUploadDataset,
} from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { ModelMetrics } from '@/lib/ml';

const fmtPct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;
const fmtInt = (n: number) => n.toLocaleString('en-US');
const fmtMb  = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;

function Stat({
  label,
  value,
  sub,
  cls = 'text-zinc-100',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  cls?: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider block mb-1">
        {label}
      </span>
      <span className={`text-xl font-mono font-bold ${cls}`}>{value}</span>
      {sub && (
        <span className="text-xs font-mono text-zinc-600 block mt-0.5">{sub}</span>
      )}
    </div>
  );
}

function ConfusionMatrix({ name, m }: { name: string; m: number[][] }) {
  const [TN, FP] = m[0];
  const [FN, TP] = m[1];
  const cells = [
    { label: 'TN', value: TN, cls: 'bg-emerald-950 text-emerald-300 border-emerald-900' },
    { label: 'FP', value: FP, cls: 'bg-amber-950 text-amber-300 border-amber-900' },
    { label: 'FN', value: FN, cls: 'bg-red-950 text-red-300 border-red-900' },
    { label: 'TP', value: TP, cls: 'bg-blue-950 text-blue-300 border-blue-900' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
          Матриця помилок
        </span>
        <span className="text-xs font-mono text-zinc-600">{name}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {cells.map((c) => (
          <div
            key={c.label}
            className={`rounded border p-2 ${c.cls} flex flex-col items-center`}
          >
            <span className="text-[10px] font-mono uppercase opacity-70">{c.label}</span>
            <span className="text-lg font-mono font-bold">{fmtInt(c.value)}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] font-mono text-zinc-600 leading-tight">
        рядки: фактичне (легіт / шахр.) · колонки: прогноз (легіт / шахр.)
      </div>
    </div>
  );
}

function ModelCard({ title, m }: { title: string; m: ModelMetrics | null }) {
  if (!m) {
    return (
      <Card className="bg-zinc-950 border-zinc-800">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold text-zinc-100 text-sm">{title}</span>
            <Badge variant="outline" className="border-zinc-700 text-zinc-500 font-mono text-xs">
              не навчено
            </Badge>
          </div>
          <p className="text-xs text-zinc-600">
            Завантажте <code className="font-mono bg-zinc-900 px-1 rounded">creditcard.csv</code> та
            натисніть <strong>Навчити</strong> нижче, щоб заповнити цю картку.
          </p>
        </CardContent>
      </Card>
    );
  }

  const trainSecs = m.train_seconds.toFixed(1);
  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono font-semibold text-zinc-100 text-sm">{title}</span>
          <div className="flex items-center gap-2">
            {m.epochs && (
              <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono text-[10px]">
                {m.epochs} епох
              </Badge>
            )}
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-mono text-[10px]">
              навчено за {trainSecs}с
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Stat label="Точність"  value={fmtPct(m.accuracy, 3)} cls="text-emerald-400" />
          <Stat label="Прецизія"  value={fmtPct(m.precision, 3)} cls="text-blue-400" />
          <Stat label="Повнота"   value={fmtPct(m.recall, 3)} cls="text-amber-400" />
          <Stat label="F1"        value={fmtPct(m.f1, 3)} cls="text-purple-400" />
          <Stat
            label="ROC-AUC"
            value={m.roc_auc !== null ? fmtPct(m.roc_auc, 3) : '—'}
            cls="text-pink-400"
          />
        </div>

        <ConfusionMatrix name={m.model} m={m.confusion_matrix} />
      </CardContent>
    </Card>
  );
}

function DatasetCard({
  refetchAll,
}: {
  refetchAll: () => void;
}) {
  const { data: info, loading, refetch } = useDatasetInfo();
  const { upload, loading: uploading, error: uploadError } = useUploadDataset(() => {
    refetch();
    refetchAll();
  });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    const f = files[0];
    if (!f.name.toLowerCase().endsWith('.csv')) {
      alert('Приймаються лише .csv файли');
      return;
    }
    void upload(f);
  };

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-mono font-semibold text-zinc-100 text-sm">
              Датасет · creditcard.csv
            </span>
            <p className="text-[11px] font-mono text-zinc-600 mt-0.5">
              Kaggle ULB — Time, V1..V28, Amount, Class
            </p>
          </div>
          {info?.exists ? (
            <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 font-mono text-[10px] border">
              ✓ завантажено
            </Badge>
          ) : (
            <Badge className="bg-amber-950 text-amber-300 border-amber-800 font-mono text-[10px] border">
              відсутній
            </Badge>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
            dragOver
              ? 'border-emerald-700 bg-emerald-950/20'
              : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/40'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <p className="text-xs font-mono text-zinc-300">
            {uploading
              ? 'Завантаження…'
              : dragOver
                ? 'Опустіть сюди'
                : 'Перетягніть creditcard.csv сюди або клацніть, щоб обрати'}
          </p>
          <p className="text-[10px] font-mono text-zinc-600 mt-1">
            Заголовок перевіряється — потрібні Time, V1..V28, Amount, Class.
          </p>
        </div>

        {uploadError && (
          <div className="bg-red-950/40 border border-red-900 rounded p-2">
            <span className="text-xs font-mono text-red-300">{uploadError}</span>
          </div>
        )}

        {loading ? (
          <Skeleton className="h-12 bg-zinc-900 rounded" />
        ) : info?.exists ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="Рядки"
              value={info.rows !== undefined ? fmtInt(info.rows) : '—'}
              cls="text-zinc-100"
            />
            <Stat
              label="Розмір"
              value={info.size_bytes ? fmtMb(info.size_bytes) : '—'}
              cls="text-blue-400"
            />
            <Stat
              label="Колонок"
              value={info.columns?.length ?? '—'}
              cls="text-purple-400"
            />
            <Stat
              label="Схема"
              value={info.is_valid_kaggle_format ? 'OK' : 'невідповідність'}
              cls={info.is_valid_kaggle_format ? 'text-emerald-400' : 'text-red-400'}
              sub={
                info.missing_columns && info.missing_columns.length > 0
                  ? `відсутні: ${info.missing_columns.join(', ')}`
                  : undefined
              }
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TrainPanel({ onDone }: { onDone: () => void }) {
  const { status } = useTrainStatus(true);
  const { retrain, loading, error: kickError } = useMlRetrain();
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log tail.
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [status?.logs.length]);

  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (prevStatus.current === 'running' && status?.status === 'success') onDone();
    prevStatus.current = status?.status ?? null;
  }, [status?.status, onDone]);

  const running = status?.status === 'running';

  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="font-mono font-semibold text-zinc-100 text-sm">
              Навчання
            </span>
            <p className="text-[11px] font-mono text-zinc-600 mt-0.5">
              Фонове завдання запускає <code className="font-mono bg-zinc-900 px-1 rounded">train.py</code> з логами в реальному часі.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {status && (
              <Badge
                className={`font-mono text-[10px] border ${
                  status.status === 'running'
                    ? 'bg-blue-950 text-blue-300 border-blue-800'
                    : status.status === 'success'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : status.status === 'error'
                        ? 'bg-red-950 text-red-300 border-red-800'
                        : 'bg-zinc-900 text-zinc-500 border-zinc-700'
                }`}
              >
                {status.status === 'running' && (
                  <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-blue-400 animate-ping" />
                )}
                {status.status === 'running' ? 'виконується'
                  : status.status === 'success' ? 'успішно'
                  : status.status === 'error' ? 'помилка'
                  : 'очікує'}
              </Badge>
            )}
            {status?.elapsed_seconds ? (
              <Badge variant="outline" className="font-mono text-[10px] border-zinc-700 text-zinc-400">
                {status.elapsed_seconds}с
              </Badge>
            ) : null}

            <Button
              size="sm"
              disabled={loading || running}
              onClick={() => retrain(false)}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-mono h-8 text-xs"
            >
              ▶ Навчити (LR + NN)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || running}
              onClick={() => retrain(true)}
              className="border-zinc-700 text-zinc-300 bg-transparent hover:bg-zinc-900 font-mono h-8 text-xs"
            >
              ▶ Тільки LogReg
            </Button>
          </div>
        </div>

        {kickError && (
          <div className="bg-red-950/40 border border-red-900 rounded p-2">
            <span className="text-xs font-mono text-red-300">{kickError}</span>
          </div>
        )}
        {status?.error && (
          <div className="bg-red-950/40 border border-red-900 rounded p-2">
            <span className="text-xs font-mono text-red-300">{status.error}</span>
          </div>
        )}

        {status && status.logs.length > 0 && (
          <div
            ref={logRef}
            className="bg-black/60 border border-zinc-800 rounded-lg p-2 h-48 overflow-auto font-mono text-[11px] text-zinc-400 leading-relaxed"
          >
            {status.logs.map((line, i) => {
              const accent =
                line.includes('error') || line.includes('Error')
                  ? 'text-red-400'
                  : line.startsWith('[done]') || line.includes('[reload]')
                    ? 'text-emerald-300'
                    : line.startsWith('[') ? 'text-blue-300' : '';
              return (
                <div key={i} className={accent}>
                  {line || ' '}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { data: health, refetch: refetchHealth } = useMlHealth();
  const { data: metrics, loading, error, refetch } = useMlMetrics();

  const refreshAll = () => { refetch(); refetchHealth(); };

  const dataset = metrics?.dataset;
  const lr = metrics?.logistic_regression ?? null;
  const nn = metrics?.neural_network ?? null;

  return (
    <div className="space-y-5">
      {/* Header / health bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-zinc-800 rounded-lg p-3 bg-zinc-950">
        <div className="space-y-0.5">
          <h2 className="font-mono font-semibold text-sm text-zinc-100">
            ML-сервіс · finguard-ml
          </h2>
          <p className="text-xs text-zinc-600">
            Повторює дипломний ноутбук (Практична 8) на даних Kaggle ULB credit-card fraud
            — Logistic Regression + Keras Sequential NN.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {health ? (
            <Badge
              className={`font-mono text-[10px] border ${
                health.status === 'ok'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border-amber-800'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  health.status === 'ok' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {health.status === 'ok' ? 'готово' : 'не навчено'}
            </Badge>
          ) : (
            <Badge className="font-mono text-[10px] bg-zinc-900 border-zinc-700 text-zinc-500">
              ml: невідомо
            </Badge>
          )}
          {health && (
            <Badge
              variant="outline"
              className="font-mono text-[10px] border-zinc-700 text-zinc-400"
            >
              logreg: {health.models.logreg ? '✓' : '—'} · nn: {health.models.nn ? '✓' : '—'}
            </Badge>
          )}
        </div>
      </div>

      {/* Dataset upload + Training panel — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DatasetCard refetchAll={refreshAll} />
        <TrainPanel onDone={refreshAll} />
      </div>

      {/* Dataset stats from the last training run */}
      <div>
        <h3 className="font-mono font-semibold text-zinc-100 text-sm mb-2">
          Статистика датасету (зріз з останнього навчання)
        </h3>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 bg-zinc-900 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
            <p className="text-xs font-mono text-zinc-500">
              Метрик навчання ще немає. Завантажте CSV та запустіть навчання вище.
            </p>
          </div>
        ) : dataset ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Stat label="Усього рядків" value={fmtInt(dataset.total_rows)} sub="Kaggle creditcard.csv" />
              <Stat
                label="Шахрайство"
                value={fmtInt(dataset.fraud_count)}
                cls="text-red-400"
                sub={`${(dataset.fraud_rate * 100).toFixed(3)}% від загального`}
              />
              <Stat
                label="Легітимні"
                value={fmtInt(dataset.legit_count)}
                cls="text-emerald-400"
                sub={`${((1 - dataset.fraud_rate) * 100).toFixed(3)}%`}
              />
              <Stat
                label="Серед. сума"
                value={`$${dataset.amount.mean.toFixed(2)}`}
                cls="text-blue-400"
                sub={`мін $${dataset.amount.min.toFixed(2)} · макс $${dataset.amount.max.toFixed(2)}`}
              />
            </div>

            {dataset.top_correlations.length > 0 && (
              <Card className="bg-zinc-950 border-zinc-800">
                <CardContent className="p-4">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 block mb-3">
                    Найбільші кореляції з Class (|r|)
                  </span>
                  <div className="space-y-1">
                    {dataset.top_correlations.slice(0, 8).map((c) => {
                      const abs = Math.abs(c.corr);
                      const w = Math.min(100, Math.round(abs * 100));
                      const positive = c.corr >= 0;
                      return (
                        <div key={c.feature} className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-300 w-12">{c.feature}</span>
                          <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${positive ? 'bg-emerald-500' : 'bg-red-500'}`}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                          <span
                            className={`font-mono text-xs w-16 text-right ${
                              positive ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {c.corr.toFixed(3)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>

      {/* Model performance */}
      <div>
        <h3 className="font-mono font-semibold text-zinc-100 text-sm mb-2">
          Продуктивність моделей
          {metrics?.test_size ? ` · тестова вибірка ${(metrics.test_size * 100).toFixed(0)}%` : ''}
        </h3>
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Skeleton className="h-72 bg-zinc-900 rounded-lg" />
            <Skeleton className="h-72 bg-zinc-900 rounded-lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ModelCard title="Логістична регресія" m={lr} />
            <ModelCard title="Нейронна мережа (Keras)" m={nn} />
          </div>
        )}
      </div>
    </div>
  );
}
