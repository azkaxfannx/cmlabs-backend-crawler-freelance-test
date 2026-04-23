import { classify, type DetectionSignals } from '../src/crawler/engine/detector';

function base(overrides: Partial<DetectionSignals> = {}): DetectionSignals {
  return {
    hasServiceWorker: false,
    hasManifest: false,
    framework: null,
    rootLooksEmptyBeforeJs: false,
    hasNextData: false,
    hasNuxtData: false,
    hasSvelteKit: false,
    bodyTextLengthRaw: 0,
    bodyTextLengthRendered: 0,
    ...overrides,
  };
}

describe('detector.classify', () => {
  it('flags a PWA when a service worker + manifest are present', () => {
    const r = classify(
      base({
        hasServiceWorker: true,
        hasManifest: true,
        bodyTextLengthRaw: 2000,
        bodyTextLengthRendered: 2500,
      }),
    );
    expect(r.kind).toBe('PWA');
  });

  it('flags an SPA when raw body is empty but rendered body is rich', () => {
    const r = classify(
      base({
        rootLooksEmptyBeforeJs: true,
        bodyTextLengthRaw: 50,
        bodyTextLengthRendered: 5000,
      }),
    );
    expect(r.kind).toBe('SPA');
  });

  it('flags HYBRID when framework markers are present and origin already shipped content', () => {
    const r = classify(
      base({
        hasNextData: true,
        framework: 'Next.js',
        bodyTextLengthRaw: 3000,
        bodyTextLengthRendered: 3500,
      }),
    );
    expect(r.kind).toBe('HYBRID');
    expect(r.framework).toBe('Next.js');
  });

  it('flags SSR when origin shipped content and no framework markers are detected', () => {
    const r = classify(
      base({
        bodyTextLengthRaw: 4000,
        bodyTextLengthRendered: 4000,
      }),
    );
    expect(r.kind).toBe('SSR');
  });

  it('falls back to STATIC when no strong signals are present', () => {
    const r = classify(base({ bodyTextLengthRaw: 100, bodyTextLengthRendered: 100 }));
    expect(r.kind).toBe('STATIC');
  });
});
