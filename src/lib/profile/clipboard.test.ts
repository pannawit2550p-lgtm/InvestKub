import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyPlayerNumber } from './clipboard';

function fallbackDocument(succeeds = true) {
  const element = { value: '', readOnly: false, style: { cssText: '' }, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
  class FakeElement { focus = vi.fn(); }
  const previous = new FakeElement();
  const execCommand = vi.fn(() => succeeds);
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('document', { activeElement: previous, createElement: () => element, body: { appendChild: vi.fn() }, execCommand });
  return { element, previous, execCommand };
}

afterEach(() => vi.unstubAllGlobals());
describe('copy player number', () => {
  it('copies only the public number when modern clipboard works', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyPlayerNumber(4321)).toBe(true);
    expect(writeText).toHaveBeenCalledWith('4321');
  });
  it('falls back to selection on clipboard denial and restores focus', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    const { element, previous, execCommand } = fallbackDocument();
    expect(await copyPlayerNumber(4321)).toBe(true);
    expect(element.value).toBe('4321');
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(element.remove).toHaveBeenCalledOnce();
    expect(previous.focus).toHaveBeenCalledOnce();
  });
  it('reports failure rather than a false success toast when both methods fail', async () => {
    vi.stubGlobal('navigator', {});
    const { element } = fallbackDocument(false);
    expect(await copyPlayerNumber(4321)).toBe(false);
    expect(element.remove).toHaveBeenCalledOnce();
  });
});
