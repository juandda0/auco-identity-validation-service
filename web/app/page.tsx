'use client';

import { useState } from 'react';
import { AuditStep } from '@/components/AuditStep';
import { CountryStep } from '@/components/CountryStep';
import { PersonStep, type PersonForm, type ValidationResult } from '@/components/PersonStep';
import { RiskStep } from '@/components/RiskStep';
import { Shell, type Step } from '@/components/Shell';
import { SignStep } from '@/components/SignStep';

/** Onboarding-style flow, one question per screen: country → identity → verdict → sign → audit. */
export default function Home() {
  const [step, setStep] = useState<Step>('country');
  const [countryCode, setCountryCode] = useState('CO');
  const [person, setPerson] = useState<PersonForm>({
    name: 'Ana Gómez',
    documentNumber: '1.020.304.050',
    phone: '+57 300 123 4567',
  });
  const [result, setResult] = useState<ValidationResult | null>(null);

  return (
    <Shell step={step} wide={step === 'sign'}>
      {step === 'country' && (
        <CountryStep countryCode={countryCode} onChange={setCountryCode} onContinue={() => setStep('person')} />
      )}
      {step === 'person' && (
        <PersonStep
          countryCode={countryCode}
          form={person}
          onChange={setPerson}
          lastDocument={result?.documentNumber ?? null}
          onBack={() => setStep('country')}
          onValidated={(r) => {
            setResult(r);
            setStep('risk');
          }}
        />
      )}
      {step === 'risk' && result && (
        <RiskStep
          validationId={result.validationId}
          onBack={() => setStep('person')}
          onContinue={() => setStep('sign')}
          onTimeline={() => setStep('audit')}
        />
      )}
      {step === 'sign' && result && (
        <SignStep validationId={result.validationId} onBack={() => setStep('risk')} onContinue={() => setStep('audit')} />
      )}
      {step === 'audit' && result && (
        <AuditStep
          countryCode={result.countryCode}
          documentNumber={result.documentNumber}
          onBack={() => setStep('risk')}
          onRestart={() => setStep('country')}
        />
      )}
    </Shell>
  );
}
