import { describe, it, expect } from 'vitest';
import { isAzureDevOpsWebUrl } from './isAzureDevOpsWebUrl';

describe('isAzureDevOpsWebUrl', () => {
  it('accepts an https dev.azure.com work item url', () => {
    expect(isAzureDevOpsWebUrl('https://dev.azure.com/org/proj/_workitems/edit/482')).toBe(true);
  });

  it('accepts an https legacy <org>.visualstudio.com url', () => {
    expect(isAzureDevOpsWebUrl('https://myorg.visualstudio.com/proj/_workitems/edit/482')).toBe(true);
  });

  it('rejects non-https schemes, even on an Azure DevOps host', () => {
    expect(isAzureDevOpsWebUrl('http://dev.azure.com/org/proj/_workitems/edit/482')).toBe(false);
    expect(isAzureDevOpsWebUrl('file:///C:/Windows/System32/calc.exe')).toBe(false);
    expect(isAzureDevOpsWebUrl('vscode://some.extension/do-something')).toBe(false);
  });

  it('rejects other hosts, including look-alikes', () => {
    expect(isAzureDevOpsWebUrl('https://evil.example.com/_workitems/edit/482')).toBe(false);
    expect(isAzureDevOpsWebUrl('https://dev.azure.com.evil.example.com/x')).toBe(false);
    expect(isAzureDevOpsWebUrl('https://evilvisualstudio.com/x')).toBe(false);
  });

  it('rejects malformed or non-string input', () => {
    expect(isAzureDevOpsWebUrl('not a url')).toBe(false);
    expect(isAzureDevOpsWebUrl(undefined)).toBe(false);
    expect(isAzureDevOpsWebUrl(42)).toBe(false);
  });
});
