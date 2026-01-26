#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REGISTRY="https://registry.npmjs.org"
REGISTRY="${REGISTRY:-$DEFAULT_REGISTRY}"
TOKEN=""
OTP="" # optional: when account requires OTP

print_help() {
  cat <<EOF
Usage:
  ./publish.sh [options]

Description:
  Publish the npm package in the current directory to npm registry using a token.
  No npm login required; the script injects a temporary token config for this publish only.
  If the registry/account enforces 2FA, you may need to provide an OTP.

Preflight requirements:
  - Must be inside a git repo and working tree must be clean.
  - Must provide a publish-capable npm token.
  - package.json name/version must be publishable and that version must not already exist.

Options:
  -t, --token <token>     npm token (recommended: Granular Access Token)
  -o, --otp <code>        2FA one-time password (6 digits, optional)
  -r, --registry <url>    npm registry (default: ${DEFAULT_REGISTRY})
  -h, --help              show help

Examples:
  # interactive token input
  ./publish.sh

  # provide token directly
  ./publish.sh --token "npm_xxx"

  # provide token + otp
  ./publish.sh --token "npm_xxx" --otp 123456
EOF
}

is_tty() {
  [[ -t 0 ]] && [[ -t 1 ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--token)
      TOKEN="${2:-}"; shift 2 ;;
    -o|--otp)
      OTP="${2:-}"; shift 2 ;;
    -r|--registry)
      REGISTRY="${2:-}"; shift 2 ;;
    -h|--help)
      print_help; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      echo >&2
      print_help
      exit 2
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: not inside a git repo; refuse to publish." >&2
  exit 2
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean; refuse to publish." >&2
  echo "Please commit all changes before publishing." >&2
  exit 2
fi

umask 077
TMP_NPMRC=""
cleanup() {
  if [[ -n "${TMP_NPMRC}" ]]; then
    rm -f "${TMP_NPMRC}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -z "${TOKEN}" ]]; then
  if is_tty; then
    read -rs -p "Enter NPM Token: " TOKEN
    echo
  else
    echo "Missing token; pass it via --token." >&2
    echo >&2
    print_help
    exit 2
  fi
fi

if [[ -z "${TOKEN}" ]]; then
  echo "Token must not be empty" >&2
  exit 2
fi

TMP_NPMRC="$(mktemp -t npmrc.ocdx-publish.XXXXXX)"
cat >"${TMP_NPMRC}" <<EOF
registry=${REGISTRY}
//registry.npmjs.org/:_authToken=${TOKEN}
EOF

if ! NPM_CONFIG_USERCONFIG="${TMP_NPMRC}" npm whoami --registry="${REGISTRY}" >/dev/null 2>&1; then
  echo "Error: token invalid or unauthorized (registry: ${REGISTRY})." >&2
  exit 2
fi

if [[ ! -f package.json ]]; then
  echo "Error: package.json not found in current directory" >&2
  exit 2
fi

PKG_NAME="$(node -p "require('./package.json').name" 2>/dev/null || true)"
PKG_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || true)"
PKG_PRIVATE="$(node -p "Boolean(require('./package.json').private)" 2>/dev/null || echo false)"

if [[ -z "$PKG_NAME" || -z "$PKG_VERSION" ]]; then
  echo "Error: package.json missing name or version" >&2
  exit 2
fi

if [[ "$PKG_PRIVATE" == "true" ]]; then
  echo "Error: package.json private=true; refuse to publish." >&2
  exit 2
fi

# Basic semver validation: x.y.z or x.y.z-xxx
if ! [[ "$PKG_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([\-\+][0-9A-Za-z\.-]+)?$ ]]; then
  echo "Error: version is not valid semver: $PKG_VERSION" >&2
  exit 2
fi

if [[ "$PKG_VERSION" == "0.0.0" ]]; then
  echo "Error: version=0.0.0 is not intended for publishing." >&2
  exit 2
fi

if NPM_CONFIG_USERCONFIG="${TMP_NPMRC}" npm view "${PKG_NAME}@${PKG_VERSION}" version --registry="${REGISTRY}" >/dev/null 2>&1; then
  echo "Error: ${PKG_NAME}@${PKG_VERSION} already exists in registry; refuse to overwrite." >&2
  exit 2
fi

if [[ -n "${OTP}" ]]; then
  NPM_CONFIG_USERCONFIG="${TMP_NPMRC}" npm publish --access public --registry="${REGISTRY}" --otp="${OTP}"
else
  NPM_CONFIG_USERCONFIG="${TMP_NPMRC}" npm publish --access public --registry="${REGISTRY}"
fi
