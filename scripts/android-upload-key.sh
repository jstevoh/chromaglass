#!/bin/bash
# The Android upload key, made once on the owner's Mac (PLAN 12-tv-2b).
#
#   bash scripts/android-upload-key.sh
#
# Google Play signs what reaches a TV or a phone with a key Google keeps (Play
# App Signing). What we upload to Play is signed with an *upload key* instead,
# and the first bundle uploaded fixes which upload key Play will accept from
# then on. This makes that key:
#
#   1. A PKCS#12 file at ~/Library/Application Support/ChromaGlass/android-upload/
#      upload.p12, outside the repository, readable by the owner only. Made with
#      the Mac's own /usr/bin/openssl: keytool, the usual tool, needs a Java
#      that a Mac without Android Studio does not have. One random password for
#      the store and the key, which Gradle reads as `storeType 'pkcs12'`
#      (androidtv/app/build.gradle).
#   2. The password in the login Keychain ("ChromaGlass Android upload key"),
#      so it is never printed and never typed.
#   3. Both as the repository's Actions secrets ANDROID_UPLOAD_KEYSTORE (the
#      file, base64) and ANDROID_UPLOAD_PASSWORD, which the release job in
#      androidtv.yml signs with. With the GitHub CLI signed in this is done for
#      you; without it the script opens the secrets page and puts each value on
#      the clipboard in turn, to paste.
#
# It refuses to run twice: a second key would not match the one Play already
# knows, and replacing an upload key is a request to Google, not a command.
# The same upload key can sign the Android phone app (12-ctl-ship) as well.
#
# Back the file up (an encrypted disk or a password manager): if it is lost,
# Play Console can reset the upload key, but that takes Google a day or two.

set -euo pipefail

REPO="jstevoh/chromaglass"
DIR="$HOME/Library/Application Support/ChromaGlass/android-upload"
FILE="$DIR/upload.p12"
KEYCHAIN_ITEM="ChromaGlass Android upload key"
OPENSSL="${OPENSSL:-/usr/bin/openssl}"

if [ -e "$FILE" ]; then
  echo "There is already an upload key at:"
  echo "  $FILE"
  echo "Not making another: Play only accepts the key it saw first."
  exit 1
fi

mkdir -p "$DIR"
chmod 700 "$DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS="$("$OPENSSL" rand -base64 33 | tr -d '/+=\n')"
export PASS

# 30 years: Play asks for an upload key valid well past the app's life.
"$OPENSSL" req -x509 -newkey rsa:4096 -sha256 -days 10950 -nodes \
  -subj "/CN=ChromaGlass Android upload" \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" 2>/dev/null
# 3DES and a SHA-1 MAC: the PKCS#12 ciphers both LibreSSL (the Mac's openssl)
# and Java's keystore reader agree on. The key itself is RSA 4096.
"$OPENSSL" pkcs12 -export -name upload \
  -inkey "$WORK/key.pem" -in "$WORK/cert.pem" \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 \
  -passout env:PASS -out "$FILE"
chmod 600 "$FILE"

security add-generic-password -U -a upload -s "$KEYCHAIN_ITEM" -w "$PASS"

echo "Made the upload key:"
echo "  $FILE"
echo "  password in your login Keychain as \"$KEYCHAIN_ITEM\""
echo "  certificate SHA-256: $("$OPENSSL" x509 -in "$WORK/cert.pem" -noout -fingerprint -sha256 | cut -d= -f2)"
echo

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  base64 < "$FILE" | tr -d '\n' | gh secret set ANDROID_UPLOAD_KEYSTORE -R "$REPO"
  printf '%s' "$PASS" | gh secret set ANDROID_UPLOAD_PASSWORD -R "$REPO"
  echo "Saved both as the repository's Actions secrets. Done."
else
  echo "Now the two GitHub secrets. A page opens; for each one:"
  echo "  type the Name shown here, click in Secret and press Cmd-V, then Add secret."
  echo
  open "https://github.com/$REPO/settings/secrets/actions/new"
  base64 < "$FILE" | tr -d '\n' | pbcopy
  echo "1) Name: ANDROID_UPLOAD_KEYSTORE   (the value is on your clipboard)"
  read -r -p "   Press Return here once it is added... " _
  open "https://github.com/$REPO/settings/secrets/actions/new"
  printf '%s' "$PASS" | pbcopy
  echo "2) Name: ANDROID_UPLOAD_PASSWORD   (the value is on your clipboard)"
  read -r -p "   Press Return here once it is added... " _
  printf '' | pbcopy
  echo "Done. The clipboard is cleared."
fi
