import path from "node:path";

/** Cloud object names are literal names, not permission to select a host path. */
export function modelDownloadPath(
  stagingDirectory: string,
  objectName: string,
  objectPrefix: string,
): string {
  if (objectPrefix && !objectName.startsWith(objectPrefix)) {
    throw new Error("A model object is outside the selected prefix.");
  }
  const relativeName = objectName.slice(objectPrefix.length);
  const parts = relativeName.split("/");
  const invalidPart = parts.some(
    (part) =>
      !part ||
      part === "." ||
      part === ".." ||
      /[\\<>:"|?*]/u.test(part) ||
      [...part].some(character => character.charCodeAt(0) < 32) ||
      /[. ]$/u.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part),
  );
  if (
    invalidPart ||
    path.posix.isAbsolute(relativeName) ||
    path.win32.isAbsolute(relativeName)
  ) {
    throw new Error("A model object has an unsafe relative filename.");
  }

  const root = path.resolve(stagingDirectory);
  const destination = path.resolve(root, ...parts);
  const relative = path.relative(root, destination);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("A model object is outside the staging directory.");
  }
  return destination;
}
