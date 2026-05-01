/**
 * Analyzer — diploma demo tab.
 * The user enters Time, Amount, V1..V28 (PCA-reduced features from Kaggle ULB) and
 * the model returns LogReg + NN predictions side-by-side, plus the gateway's
 * scoring object (verdict, signals, recommendations). This is the live equivalent
 * of "Hypothesis 2 — comparing LR vs NN" from the diploma notebook.
 */

import { useMemo, useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useMlPredict, useMlModelInfo } from '@/hooks';
import {
  ML_FEATURE_KEYS,
  type MlFeatureKey,
  type MlFeatures,
  type MlModelChoice,
  type MlPredictionPayload,
} from '@/lib/ml';

const SAMPLES: Record<string, MlFeatures> = {
  /* Kaggle row #0 (legit, Class=0). */
  legit_typical: {
    Time: 0,    V1: -1.3598071, V2: -0.0727812, V3: 2.5363467, V4: 1.3781552,
    V5: -0.3383208, V6: 0.4623878, V7: 0.2395986, V8: 0.0986979, V9: 0.3637870,
    V10: 0.0907942, V11: -0.5515995, V12: -0.6178009, V13: -0.9913898,
    V14: -0.3111694, V15: 1.4681770, V16: -0.4704005, V17: 0.2079712,
    V18: 0.0257906, V19: 0.4039930, V20: 0.2514121, V21: -0.0183068,
    V22: 0.2778376, V23: -0.1104739, V24: 0.0669281, V25: 0.1285394,
    V26: -0.1891148, V27: 0.1335584, V28: -0.0210531,
    Amount: 149.62,
  },
  /* Kaggle row #541 (fraud, Class=1). */
  fraud_known: {
    Time: 406, V1: -2.3122265, V2: 1.9519920, V3: -1.6098506, V4: 3.9979057,
    V5: -0.5221878, V6: -1.4265454, V7: -2.5373871, V8: 1.3916572,
    V9: -2.7700893, V10: -2.7722721, V11: 3.2020332, V12: -2.8999075,
    V13: -0.5952218, V14: -4.2892537, V15: 0.3897242, V16: -1.1407466,
    V17: -2.8300557, V18: -0.0168224, V19: 0.4169876, V20: 0.1264908,
    V21: 0.5172324, V22: -0.0350490, V23: -0.4652113, V24: 0.3201981,
    V25: 0.0445191, V26: 0.1778398, V27: 0.2611453, V28: -0.1432758,
    Amount: 0,
  },
  zeros: Object.fromEntries(ML_FEATURE_KEYS.map((k) => [k, 0])) as MlFeatures,
};

const VERDICT_CFG = {
  approved: { label: 'Підтверджено', cls: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  approved_with_review: { label: 'Огляд', cls: 'bg-amber-950 text-amber-300 border-amber-800' },
  blocked: { label: 'Заблоковано', cls: 'bg-red-950 text-red-300 border-red-800' },
  pending_manual_review: { label: 'Очікує', cls: 'bg-indigo-950 text-indigo-300 border-indigo-800' },
} as const;

function VerdictPill({ verdict }: { verdict: keyof typeof VERDICT_CFG }) {
  const c = VERDICT_CFG[verdict];
  return (
    <Badge className={`text-xs border font-mono ${c.cls}`}>{c.label}</Badge>
  );
}

function ProbBar({ p }: { p: number }) {
  const pct = Math.round(p * 100);
  const cls =
    pct >= 86 ? 'bg-red-500'
      : pct >= 61 ? 'bg-orange-500'
        : pct >= 31 ? 'bg-amber-500'
          : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-xs">
        <span className="text-zinc-400">ймовірність шахрайства</span>
        <span className="text-zinc-100 font-bold">{p.toFixed(4)}</span>
      </div>
      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div className={`h-full ${cls} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ModelResultCard({ p }: { p: MlPredictionPayload }) {
  return (
    <Card className="bg-zinc-950 border-zinc-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-mono font-semibold text-sm text-zinc-100 uppercase">
            {p.model}
          </span>
          <VerdictPill verdict={p.decision} />
        </div>

        <ProbBar p={p.probability} />

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
              мітка
            </span>
            <span
              className={`text-lg font-mono font-bold ${
                p.label === 1 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {p.label}
            </span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
              ризик
            </span>
            <span className="text-lg font-mono font-bold text-amber-400">
              {p.risk_score}
            </span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
              рішення
            </span>
            <span className="text-[10px] font-mono text-zinc-100">
              {VERDICT_CFG[p.decision].label}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Analyzer() {
  const { data: info } = useMlModelInfo();
  const { predict, result, loading, error, reset } = useMlPredict();

  const [features, setFeatures] = useState<MlFeatures>(SAMPLES.legit_typical);
  const [threshold, setThreshold] = useState(0.5);
  const [model, setModel] = useState<MlModelChoice>('ensemble');

  const setVal = (k: MlFeatureKey, v: string) => {
    const num = Number(v);
    setFeatures((p) => ({ ...p, [k]: Number.isFinite(num) ? num : 0 }));
  };

  const onSample = (key: keyof typeof SAMPLES) => {
    setFeatures(SAMPLES[key]);
    reset();
  };

  const featureGroups = useMemo(() => {
    const groups: MlFeatureKey[][] = [];
    const meta: MlFeatureKey[] = ['Time', 'Amount'];
    const v: MlFeatureKey[] = ML_FEATURE_KEYS.filter(
      (k) => k !== 'Time' && k !== 'Amount',
    );
    groups.push(meta);
    for (let i = 0; i < v.length; i += 7) groups.push(v.slice(i, i + 7));
    return groups;
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-mono font-semibold text-sm text-zinc-100">
            Аналізатор транзакцій
          </h2>
          <p className="text-xs text-zinc-600 mt-0.5">
            Разовий скоринг через навчені моделі. На вхід — PCA-анонімізовані ознаки
            (V1..V28) + Time + Amount, як у датасеті Kaggle ULB.
          </p>
        </div>
        {info && (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="font-mono text-[10px] border-zinc-700 text-zinc-400"
            >
              ознак: {info.feature_columns.length}
            </Badge>
            {info.trained_at && (
              <Badge
                variant="outline"
                className="font-mono text-[10px] border-zinc-700 text-zinc-400"
              >
                навчено {info.trained_at.split('T')[0]}
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Inputs */}
        <Card className="bg-zinc-950 border-zinc-800 lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-500">
                Зразок:
              </span>
              {(
                [
                  ['legit_typical', 'Легіт (рядок №0)',     'border-emerald-800 text-emerald-300'],
                  ['fraud_known',   'Шахрайство (рядок №541)', 'border-red-800 text-red-300'],
                  ['zeros',         'Нулі',                 'border-zinc-700 text-zinc-300'],
                ] as const
              ).map(([key, label, cls]) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  onClick={() => onSample(key)}
                  className={`h-7 text-[11px] font-mono ${cls} bg-transparent hover:bg-zinc-900`}
                >
                  {label}
                </Button>
              ))}
            </div>

            <Separator className="bg-zinc-800" />

            {featureGroups.map((g, i) => (
              <div
                key={i}
                className={`grid gap-2 ${i === 0 ? 'grid-cols-2' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-7'}`}
              >
                {g.map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                      {k}
                    </Label>
                    <Input
                      value={features[k]}
                      onChange={(e) => setVal(k, e.target.value)}
                      type="number"
                      step="any"
                      className="bg-zinc-900 border-zinc-700 font-mono h-7 text-[11px] text-zinc-100 placeholder:text-zinc-600"
                    />
                  </div>
                ))}
              </div>
            ))}

            <Separator className="bg-zinc-800" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Поріг
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="bg-zinc-900 border-zinc-700 font-mono h-8 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
                  Основна модель
                </Label>
                <Select value={model} onValueChange={(v) => setModel(v as MlModelChoice)}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-700 h-8 text-sm text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="ensemble">ансамбль (max p)</SelectItem>
                    <SelectItem value="logreg">логістична регресія</SelectItem>
                    <SelectItem value="nn">нейронна мережа</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  disabled={loading}
                  onClick={() => predict(features, { threshold, model })}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-mono h-8 text-xs"
                >
                  {loading ? 'Прогнозування…' : '▶ Спрогнозувати'}
                </Button>
              </div>
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900 rounded p-2">
                <span className="text-xs font-mono text-red-300">{error}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Output */}
        <div className="space-y-3">
          {result ? (
            <>
              <Card className="bg-zinc-950 border-zinc-800">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-sm text-zinc-100">
                      Вердикт
                    </span>
                    <VerdictPill verdict={result.scoring.verdict} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                        оцінка ризику
                      </span>
                      <span className="text-2xl font-mono font-bold text-amber-400">
                        {result.scoring.riskScore}
                      </span>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-2">
                      <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">
                        впевненість
                      </span>
                      <span className="text-2xl font-mono font-bold text-blue-400">
                        {(result.scoring.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {result.scoring.reasoning}
                  </p>
                </CardContent>
              </Card>

              {result.scoring.signals.length > 0 && (
                <Card className="bg-zinc-950 border-zinc-800">
                  <CardContent className="p-4 space-y-2">
                    <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider block">
                      Сигнали ({result.scoring.signals.length})
                    </span>
                    <div className="space-y-1.5">
                      {result.scoring.signals.map((s, i) => (
                        <div
                          key={i}
                          className="bg-zinc-900 border border-zinc-800 rounded p-2"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="text-xs font-mono text-red-400">
                              {s.code}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 px-1 border-zinc-700 text-zinc-500 font-mono"
                            >
                              {s.category}
                            </Badge>
                            <span className="ml-auto text-[10px] font-mono text-zinc-500">
                              w:{(s.weight * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{s.description}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="bg-zinc-950 border-zinc-800 border-dashed">
              <CardContent className="p-6 text-center">
                <span className="text-xs font-mono text-zinc-700">
                  Заповніть форму та натисніть Спрогнозувати, щоб порівняти LogReg та НМ.
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Model comparison */}
      {result && (
        <div className="space-y-2">
          <h3 className="font-mono font-semibold text-zinc-100 text-sm">
            Результати по моделях
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.raw.predictions.map((p, i) => (
              <ModelResultCard key={`${p.model}-${i}`} p={p} />
            ))}
          </div>
          <p className="text-[10px] font-mono text-zinc-600">
            Інференс: {result.raw.processing_ms}мс · поріг {result.raw.threshold} ·
            вимір нормалізованого вектора {result.raw.feature_vector_normalised.length}
          </p>
        </div>
      )}
    </div>
  );
}
