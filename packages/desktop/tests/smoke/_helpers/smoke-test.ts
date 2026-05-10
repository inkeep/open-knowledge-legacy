import type { ChildProcess } from 'node:child_process';
import { expect as baseExpect, test as baseTest, type ElectronApplication } from '@playwright/test';
import { captureAppProcess, closeAppBounded } from './electron-cleanup';
import {
  captureElectronStderr,
  type ElectronStderrCapture,
  shouldAttachStderr,
} from './electron-stderr';

export interface SmokeFixtures {
  captureStderrFor: (app: ElectronApplication) => void;
}

export const test = baseTest.extend<SmokeFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture contract
  captureStderrFor: async ({}, use, testInfo) => {
    const captures: ElectronStderrCapture[] = [];
    const procs: ChildProcess[] = [];
    await use((app) => {
      captures.push(captureElectronStderr(app));
      procs.push(captureAppProcess(app));
    });
    if (shouldAttachStderr(testInfo)) {
      for (const capture of captures) {
        await capture.attachTo(testInfo);
      }
    }
    for (const proc of procs) {
      await closeAppBounded(proc, { gracefulMs: 5_000 });
    }
  },
});

export const expect = baseExpect;
