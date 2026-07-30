import { describe, it, expect } from 'vitest';
import { renderPrStatusDot, resolvePrStatusColor } from './renderPrStatus';

describe('renderPrStatusDot', () => {
  it('uses blue for active', () => {
    expect(renderPrStatusDot('active', false)).toContain('background-color: var(--vscode-charts-blue)');
  });

  it('uses green for completed', () => {
    expect(renderPrStatusDot('completed', false)).toContain('background-color: var(--vscode-charts-green)');
  });

  it('uses red for abandoned', () => {
    expect(renderPrStatusDot('abandoned', false)).toContain('background-color: var(--vscode-charts-red)');
  });

  it('falls back to blue for an unknown status', () => {
    expect(renderPrStatusDot('mystery', false)).toContain('background-color: var(--vscode-charts-blue)');
  });

  it('uses yellow when isDraft is true, regardless of status', () => {
    expect(renderPrStatusDot('completed', true)).toContain('background-color: var(--vscode-charts-yellow)');
  });

  it('renders the kb-status-dot class', () => {
    expect(renderPrStatusDot('active', false)).toContain('class="kb-status-dot"');
  });
});

describe('resolvePrStatusColor', () => {
  it('uses blue for active', () => {
    expect(resolvePrStatusColor('active', false)).toBe('var(--vscode-charts-blue)');
  });

  it('uses green for completed', () => {
    expect(resolvePrStatusColor('completed', false)).toBe('var(--vscode-charts-green)');
  });

  it('uses red for abandoned', () => {
    expect(resolvePrStatusColor('abandoned', false)).toBe('var(--vscode-charts-red)');
  });

  it('falls back to blue for an unknown status', () => {
    expect(resolvePrStatusColor('mystery', false)).toBe('var(--vscode-charts-blue)');
  });

  it('uses yellow when isDraft is true, regardless of status', () => {
    expect(resolvePrStatusColor('completed', true)).toBe('var(--vscode-charts-yellow)');
  });
});
