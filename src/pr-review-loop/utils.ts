import { readFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { assetUrl } from '../index';

/**
 * Parse a model string in the format "providerID/modelID"
 *
 * @param model - Model string to parse (e.g., "anthropic/claude-3-5-sonnet-20241022")
 * @returns Parsed model configuration with providerID and modelID
 * @throws Error if the model string format is invalid
 *
 * @example
 * const config = parseModelString("anthropic/claude-3-5-sonnet-20241022");
 * // Returns: { providerID: "anthropic", modelID: "claude-3-5-sonnet-20241022" }
 *
 * @example
 * parseModelString("invalid");
 * // Throws: Error("Invalid model string format: expected 'provider/model'")
 */
export function parseModelString(model: string): { providerID: string; modelID: string } {
  const parts = model.split('/');

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid model string format: expected 'provider/model', got '${model}'`);
  }

  return {
    providerID: parts[0],
    modelID: parts[1],
  };
}

/**
 * Extract JSON from text enclosed by BEGIN_JSON and END_JSON markers
 *
 * Uses a regex pattern to find content between the markers and attempts to parse it.
 * Returns null if markers are not found or JSON is invalid.
 *
 * @param text - Text that may contain JSON envelope markers
 * @returns Parsed JSON object or null if markers not found or JSON is invalid
 *
 * @example
 * const json = extractJsonEnvelope("Some text\nBEGIN_JSON\n{\"key\":\"value\"}\nEND_JSON\nMore");
 * // Returns: { key: "value" }
 *
 * @example
 * const json = extractJsonEnvelope("No markers here");
 * // Returns: null
 *
 * @example
 * const json = extractJsonEnvelope("BEGIN_JSON\n{invalid json}\nEND_JSON");
 * // Returns: null (JSON parsing fails silently)
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function extractJsonEnvelope(text: string): any | null {
  const match = text.match(/BEGIN_JSON\s*([\s\S]*?)\s*END_JSON/);

  if (!match || !match[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Load a prompt asset file from the pr-review-loop prompts directory
 *
 * Supports:
 * 1. Custom absolute path (if provided and starts with / or ~)
 * 2. Custom relative path (if provided, relative to repo root)
 * 3. Default bundled path (fallback)
 *
 * @param name - Prompt file name (e.g., "reviewer.md", "comments-analyzer.md")
 * @param customPath - Optional custom path from config (absolute or relative)
 * @returns Promise that resolves to the full file contents as a string
 * @throws Error if the file does not exist or cannot be read
 *
 * @example
 * // Default bundled prompt
 * const reviewerPrompt = await loadPromptAsset("reviewer.md");
 * // Returns: Full contents of src/prompts/pr-review-loop/reviewer.md
 *
 * @example
 * // Custom absolute path with ~ expansion
 * const reviewerPrompt = await loadPromptAsset("reviewer.md", "~/.config/opencode/prompts/my-reviewer.md");
 *
 * @example
 * // Custom relative path
 * const reviewerPrompt = await loadPromptAsset("reviewer.md", "prompts/custom-reviewer.md");
 */
export async function loadPromptAsset(name: string, customPath?: string): Promise<string> {
  let resolvedPath: URL;

  if (customPath) {
    // Handle ~ expansion
    if (customPath.startsWith('~/')) {
      const homeDir = os.homedir();
      const expandedPath = path.join(homeDir, customPath.slice(2));
      resolvedPath = new URL(`file://${expandedPath}`);
    }
    // Handle absolute path
    else if (customPath.startsWith('/')) {
      resolvedPath = new URL(`file://${customPath}`);
    }
    // Handle relative path (relative to repo root)
    else {
      resolvedPath = assetUrl(customPath);
    }
  } else {
    // Default: use bundled prompts
    resolvedPath = assetUrl(`src/prompts/pr-review-loop/${name}`);
  }

  return readFile(resolvedPath, 'utf-8');
}
