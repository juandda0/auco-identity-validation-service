'use client';

import { useState } from 'react';
import { AuditStep } from '@/components/AuditStep';
import { Header, type Step } from '@/components/Header';
import { RiskStep } from '@/components/RiskStep';
import { SignStep } from '@/components/SignStep';
import { ValidateStep, type ValidateResult } from '@/components/ValidateStep';

/** One page, four steps: validate → risk verdict → promissory note and signature → audit. */
export default function Home() {
  const [step, setStep] = useState<Step>('validate');
  const [current, setCurrent] = useState<ValidateResult | null>(null);

  const restart = () => setStep('validate');

  return (
    <div className="flex min-h-screen flex-col">
      <Header step={step} />
      {step === 'validate' && (
        <ValidateStep
          lastDocument={current?.documentNumber ?? null}
          onValidated={(result) => {
            setCurrent(result);
            setStep('risk');
          }}
        />
      )}
      {step === 'risk' && current && (
        <RiskStep
          validationId={current.validationId}
          onContinue={() => setStep('sign')}
          onRestart={restart}
          onTimeline={() => setStep('audit')}
        />
      )}
      {step === 'sign' && current && (
        <SignStep validationId={current.validationId} onTimeline={() => setStep('audit')} />
      )}
      {step === 'audit' && current && (
        <AuditStep
          countryCode={current.countryCode}
          documentNumber={current.documentNumber}
          onRestart={restart}
        />
      )}
    </div>
  );
}
