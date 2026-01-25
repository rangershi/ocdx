import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

/**
 * OCDX configuration schema
 * Loaded from ~/.config/opencode/ocdx/config.json (preferred)
 */
export interface OcdxConfig {
  /** Optional model tiers for different cost/quality tradeoffs */
  models?: {
    /** High quality / higher cost model */
    high?: string;
    /** Medium tradeoff model */
    medium?: string;
    /** Low cost / fast model */
    low?: string;
  };
  /** Array of 1-5 reviewer model strings (e.g., "anthropic/claude-3-5-sonnet-20241022") */
  reviewerModels: string[];
  /** Model for analyzing PR comments (non-empty string) */
  commentsAnalyzerModel: string;
  /** Model for generating PR fixes (non-empty string) */
  prFixModel: string;
  /** Optional custom prompt file paths (absolute or relative). If not provided, uses bundled prompts. */
  prompts?: {
    /** Optional custom path to reviewer prompt template (supports ~ expansion and relative paths) */
    reviewer?: string;
    /** Optional custom path to comments-analyzer prompt template (supports ~ expansion and relative paths) */
    commentsAnalyzer?: string;
    /** Optional custom path to pr-fix prompt template (supports ~ expansion and relative paths) */
    prFix?: string;
  };
}

/**
 * Custom error class for configuration loading failures
 */
export class ConfigError extends Error {
  constructor(
    public code: string,
    message: string,
    public configPath: string,
    public exampleJson?: string
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Example configuration JSON for error messages
 */
const EXAMPLE_CONFIG_JSON = `{
  "models": {
    "high": "anthropic/claude-3-7-sonnet-20250219",
    "medium": "anthropic/claude-3-5-sonnet-20241022",
    "low": "anthropic/claude-3-5-haiku-20241022"
  },
  "reviewerModels": ["anthropic/claude-3-5-sonnet-20241022"],
  "commentsAnalyzerModel": "anthropic/claude-3-5-sonnet-20241022",
  "prFixModel": "anthropic/claude-3-5-sonnet-20241022",
  "prompts": {
    "reviewer": "~/.config/opencode/ocdx/prompt/reviewer.md",
    "commentsAnalyzer": "~/.config/opencode/ocdx/prompt/comments-analyzer.md",
    "prFix": "~/.config/opencode/ocdx/prompt/pr-fix.md"
  }
}`;

function getConfigHome(): string {
  if (process.env.XDG_CONFIG_HOME) return process.env.XDG_CONFIG_HOME;

  if (process.platform === 'win32') {
    if (process.env.APPDATA) return process.env.APPDATA;
    return path.join(os.homedir(), 'AppData', 'Roaming');
  }

  return path.join(os.homedir(), '.config');
}

function bundledDefaultConfigUrl(): URL {
  const moduleDir = new URL('.', import.meta.url);
  const pkgRoot = new URL('..', moduleDir); // parent of src/ or dist/
  return new URL('@asset/config.json', pkgRoot);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load and validate OCDX configuration with project-level override support
 *
 * Configuration file search order (first found wins):
 * 1. Project-level: `<projectRoot>/.opencode/ocdx/config.json` (preferred)
 * 2. Global-level: `~/.config/opencode/ocdx/config.json`
 * 3. Bundled defaults: `@asset/config.json` (fallback)
 *
 * Validation rules:
 * - reviewerModels: array of 1-5 non-empty strings
 * - commentsAnalyzerModel: non-empty string
 * - prFixModel: non-empty string
 *
 * Error codes thrown:
 * - CONFIG_NOT_FOUND: Config file does not exist in any location
 * - CONFIG_INVALID_JSON: File contains invalid JSON
 * - CONFIG_MISSING_FIELDS: Required fields are missing
 * - CONFIG_INVALID_REVIEWERS: reviewerModels array invalid (empty, >5 entries, or contains empty strings)
 * - CONFIG_INVALID_SCHEMA: Type validation failed
 *
 * Example usage:
 * ```typescript
 * try {
 *   const config = await loadOcdxConfigStrict('/path/to/project');
 *   console.log(config.reviewerModels);
 * } catch (error) {
 *   if (error instanceof ConfigError) {
 *     console.error(error.code, error.message);
 *     console.error('Config path:', error.configPath);
 *     console.error('Example:', error.exampleJson);
 *   }
 * }
 * ```
 *
 * @param projectRoot - Project root directory (defaults to current working directory)
 * @returns Promise<OcdxConfig> Validated configuration object
 * @throws {ConfigError} If config file is missing, invalid, or fails validation
 */
export async function loadOcdxConfigStrict(projectRoot?: string): Promise<OcdxConfig> {
  // 1. Resolve config path with project-level override support
  const cwd = projectRoot || process.cwd();
  const configHome = getConfigHome();

  const projectConfigDirPath = path.join(cwd, '.opencode', 'ocdx', 'config.json');
  const globalConfigDirPath = path.join(configHome, 'opencode', 'ocdx', 'config.json');

  const configPaths = [
    projectConfigDirPath, // Project-level (preferred)
    globalConfigDirPath, // Global-level (preferred)
  ];

  let configPath: string | null = null;
  for (const candidatePath of configPaths) {
    if (await fileExists(candidatePath)) {
      configPath = candidatePath;
      break;
    }
  }

  // Bundled defaults fallback (works even if postinstall was skipped)
  if (!configPath) {
    try {
      // If readFile fails, it will be handled below.
      configPath = fileURLToPath(bundledDefaultConfigUrl());
    } catch {
      // ignore
    }
  }

  if (!configPath) {
    const searchedPaths = configPaths.join('\n  - ');
    throw new ConfigError(
      'CONFIG_NOT_FOUND',
      `Config file not found in any of these locations:\n  - ${searchedPaths}\n\nPlease create one with the following structure:\n${EXAMPLE_CONFIG_JSON}`,
      projectConfigDirPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // 2. Read file contents
  let fileContents: string;
  try {
    fileContents = await fs.readFile(configPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigError(
        'CONFIG_NOT_FOUND',
        `Config file not found at: ${configPath}\n\nPlease create the file with the following structure:\n${EXAMPLE_CONFIG_JSON}`,
        configPath,
        EXAMPLE_CONFIG_JSON
      );
    }
    throw new ConfigError(
      'CONFIG_NOT_FOUND',
      `Failed to read config file at: ${configPath}\nError: ${error}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // 3. Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContents);
  } catch (error) {
    throw new ConfigError(
      'CONFIG_INVALID_JSON',
      `Config file contains invalid JSON: ${error}\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // 4. Validate schema
  if (typeof parsed !== 'object' || parsed === null) {
    throw new ConfigError(
      'CONFIG_INVALID_SCHEMA',
      `Config must be a JSON object\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  const config = parsed as Record<string, unknown>;

  // Check for missing fields
  const missingFields: string[] = [];
  if (!('reviewerModels' in config)) missingFields.push('reviewerModels');
  if (!('commentsAnalyzerModel' in config)) missingFields.push('commentsAnalyzerModel');
  if (!('prFixModel' in config)) missingFields.push('prFixModel');

  if (missingFields.length > 0) {
    throw new ConfigError(
      'CONFIG_MISSING_FIELDS',
      `Missing required fields: ${missingFields.join(', ')}\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // Validate reviewerModels
  if (!Array.isArray(config.reviewerModels)) {
    throw new ConfigError(
      'CONFIG_INVALID_SCHEMA',
      `reviewerModels must be an array\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  if (config.reviewerModels.length < 1 || config.reviewerModels.length > 5) {
    throw new ConfigError(
      'CONFIG_INVALID_REVIEWERS',
      `reviewerModels must have 1-5 entries (found ${config.reviewerModels.length})\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // Validate all reviewerModels are non-empty strings
  for (let i = 0; i < config.reviewerModels.length; i++) {
    const model = config.reviewerModels[i];
    if (typeof model !== 'string' || model.trim() === '') {
      throw new ConfigError(
        'CONFIG_INVALID_REVIEWERS',
        `reviewerModels[${i}] must be a non-empty string\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
        configPath,
        EXAMPLE_CONFIG_JSON
      );
    }
  }

  // Validate commentsAnalyzerModel
  if (
    typeof config.commentsAnalyzerModel !== 'string' ||
    config.commentsAnalyzerModel.trim() === ''
  ) {
    throw new ConfigError(
      'CONFIG_INVALID_SCHEMA',
      `commentsAnalyzerModel must be a non-empty string\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // Validate prFixModel
  if (typeof config.prFixModel !== 'string' || config.prFixModel.trim() === '') {
    throw new ConfigError(
      'CONFIG_INVALID_SCHEMA',
      `prFixModel must be a non-empty string\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
      configPath,
      EXAMPLE_CONFIG_JSON
    );
  }

  // Validate optional models tiers
  if ('models' in config && config.models !== undefined) {
    if (
      typeof config.models !== 'object' ||
      config.models === null ||
      Array.isArray(config.models)
    ) {
      throw new ConfigError(
        'CONFIG_INVALID_SCHEMA',
        `models must be an object\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
        configPath,
        EXAMPLE_CONFIG_JSON
      );
    }

    const models = config.models as Record<string, unknown>;
    for (const key of ['high', 'medium', 'low'] as const) {
      if (key in models && models[key] !== undefined) {
        if (typeof models[key] !== 'string' || (models[key] as string).trim() === '') {
          throw new ConfigError(
            'CONFIG_INVALID_SCHEMA',
            `models.${key} must be a non-empty string\n\nExpected format:\n${EXAMPLE_CONFIG_JSON}`,
            configPath,
            EXAMPLE_CONFIG_JSON
          );
        }
      }
    }
  }

  // Return validated config
  return {
    models: config.models as OcdxConfig['models'],
    reviewerModels: config.reviewerModels as string[],
    commentsAnalyzerModel: config.commentsAnalyzerModel as string,
    prFixModel: config.prFixModel as string,
    prompts: config.prompts as OcdxConfig['prompts'],
  };
}
