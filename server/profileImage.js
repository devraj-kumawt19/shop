export const MAX_PROFILE_IMAGE_BYTES = 180 * 1024;
const MAX_PROFILE_IMAGE_LENGTH = Math.ceil(MAX_PROFILE_IMAGE_BYTES / 3) * 4 + "data:image/jpeg;base64,".length;

export function isValidProfileImage(value) {
  if (typeof value !== "string" || value.length > MAX_PROFILE_IMAGE_LENGTH) return false;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[1], "base64");
  return bytes.length > 4
    && bytes.length <= MAX_PROFILE_IMAGE_BYTES
    && bytes.toString("base64") === match[1]
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff
    && bytes.at(-2) === 0xff
    && bytes.at(-1) === 0xd9;
}
