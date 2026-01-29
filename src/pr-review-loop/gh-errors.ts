function getStringProp(obj: object, key: string): string | undefined {
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function extractGhErrorDetails(error: unknown): string | undefined {
  if (typeof error === 'string') return error.trim() || undefined;

  if (error instanceof Error) {
    return error.message.trim() || undefined;
  }

  if (typeof error === 'object' && error !== null) {
    const stderr = getStringProp(error, 'stderr');
    const message = getStringProp(error, 'message');
    const raw = (stderr && stderr.trim()) || (message && message.trim());
    return raw || undefined;
  }

  return undefined;
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase();
}

export function isLikelyGhAuthOrPermissionIssue(error: unknown): boolean {
  const details = extractGhErrorDetails(error);
  if (!details) return false;

  const t = normalizeForMatch(details);

  return (
    t.includes('authentication') ||
    t.includes('not logged in') ||
    t.includes('requires authentication') ||
    t.includes('must authenticate') ||
    t.includes('unauthorized') ||
    t.includes('forbidden') ||
    t.includes('permission') ||
    t.includes('insufficient') ||
    t.includes('resource not accessible') ||
    t.includes('sso') ||
    t.includes('http 401') ||
    t.includes('http 403')
  );
}

export function formatGhAuthHelp(error: unknown): string {
  const details = extractGhErrorDetails(error);
  const trimmedDetails = details ? details.split('\n').slice(0, 6).join('\n').slice(0, 600) : '';

  return `GitHub CLI 鉴权失败（无法通过 gh 校验）。\n\n建议操作：\n1) 运行：gh auth status\n2) 未登录：gh auth login\n3) 已登录但访问私有仓库/组织失败：gh auth refresh -s repo,read:org\n4) 若组织开启了 SSO：在 GitHub 的 SSO 授权页面给当前 token 授权\n\n如果你使用 GitHub Enterprise：确保登录了正确的 host（gh auth login --hostname <host>）。\n${trimmedDetails ? `\n原始错误（截断）：\n${trimmedDetails}` : ''}`;
}

export function formatGhPermissionHelp(action: string, error: unknown): string {
  const details = extractGhErrorDetails(error);
  const trimmedDetails = details ? details.split('\n').slice(0, 10).join('\n').slice(0, 900) : '';

  return `GitHub CLI 权限不足或访问失败：${action}\n\n建议操作：\n1) 运行：gh auth status（确认当前账号/host）\n2) 必要时重新登录：gh auth login\n3) 刷新 token scope：gh auth refresh -s repo,read:org\n4) 若组织开启了 SSO：授权当前 token 的 SSO 访问\n\n${trimmedDetails ? `原始错误（截断）：\n${trimmedDetails}` : '原始错误：无更多输出（可能被上层吞掉）'}`;
}

export function describeUnknownError(error: unknown): string {
  const details = extractGhErrorDetails(error);
  if (details) return details;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
