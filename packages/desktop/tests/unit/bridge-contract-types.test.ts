
import { describe, expect, test } from 'bun:test';
import type { OkDesktopBridge as AppBridge } from '../../../app/src/lib/desktop-bridge-types.ts';
import type { OkDesktopBridge as CoreBridge } from '../../../core/src/desktop-bridge.ts';
import type { OkDesktopBridge as DesktopBridge } from '../../src/shared/bridge-contract.ts';

type Eq<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

describe('OkDesktopBridge structural equivalence (F19)', () => {
  test('core ≡ desktop (method signatures)', () => {
    const _coreEqDesktop: Eq<CoreBridge, DesktopBridge> = true;
    expect(_coreEqDesktop).toBe(true);
  });

  test('core ≡ app (method signatures)', () => {
    const _coreEqApp: Eq<CoreBridge, AppBridge> = true;
    expect(_coreEqApp).toBe(true);
  });

  test('desktop ≡ app (method signatures)', () => {
    const _desktopEqApp: Eq<DesktopBridge, AppBridge> = true;
    expect(_desktopEqApp).toBe(true);
  });
});
