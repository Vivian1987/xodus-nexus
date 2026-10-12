export function runtimeInputsChanged(files) {
  return files.some(file => /^assets\/.*\.patch$/s.test(file) ||
    /^scripts\/(?:ci\/|runtime-tests\/|runtime-.*\.lock\.json$|(?:build-shared-runtime|assemble-shared-runtime|verify-runtime-base)\.mjs$)/.test(file) ||
    file === '.github/workflows/runtime.yml' || /^src\/main\/proton\./.test(file));
}
