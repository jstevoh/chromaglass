#!/usr/bin/env bash
# Install Ubuntu packages on a CI runner without waiting on a slow apt mirror
# (PLAN.md 19ab-4). `checks.yml` runs it for the sound shard's ffmpeg:
#
#   scripts/debcache.sh ~/ffmpeg-debs ffmpeg
#
# What was reported: on 2026-10-26 the sound shard's `apt-get install ffmpeg`
# ran out its four-minute bound twice in an hour, and every check after it that
# decodes a song or opens a rendered file failed on "no ffmpeg on the path" or
# "no ffprobe on the path", on PRs that touched no sound. The first fix kept the
# .debs in the Actions cache, and its own first run measured why the cold fetch
# cannot be left to apt either: the package lists came from the runner's Azure
# mirror at 11 MB/s, then the 87 packages (62.8 MB) came at 55 KB/s, one at a
# time, about a second of wait per request, 9 MB in 165 s for one of them. At
# that pace the set takes nineteen minutes, and apt has no low-speed limit, so
# a mirror that is slow rather than silent holds it until the bound kills it.
#
# So, in order:
#   1. The directory's .debs, if the Actions cache brought any, are installed
#      with apt reading an empty source list: no mirror is asked, and a set that
#      no longer fits the runner (a dependency missing, or a downgrade, which
#      apt refuses under -y) fails at once instead of quietly downloading.
#   2. Otherwise apt computes what is missing (`--print-uris` after an update;
#      the lists are fast even when the pool is not) and the files are fetched
#      here, eight at a time, each from the first of several mirrors that
#      delivers it at a useful speed: curl drops a mirror sending under 300 KB/s
#      for 20 s and tries the next. Each file is held to apt's own size and hash
#      before it is kept, then the set is installed offline as in 1, and the
#      directory is left for the cache to save.
#
# Ubuntu's own build is installed either way, never a static one from elsewhere:
# the shelf's MP3s go through the decoder the sound checks were measured with.
set -euo pipefail

# One file, from the first mirror that delivers it whole. Called through xargs
# below as: debcache.sh --fetch <dir> <uri> <file> <size> <algo:hash>.
if [[ "${1:-}" == --fetch ]]; then
  dir=$2 uri=${3//\'/} file=$4 size=$5 sum=$6
  pool=pool/${uri#*/pool/}
  case ${sum%%:*} in
    MD5Sum) tool=md5sum ;; SHA1) tool=sha1sum ;; SHA256) tool=sha256sum ;; SHA512) tool=sha512sum ;;
    *) echo "::error title=debcache::$file: no way to check a ${sum%%:*} hash"; exit 1 ;;
  esac
  # shellcheck disable=SC2206 # the mirrors are a space-separated list
  mirrors=(${DEB_MIRRORS:-http://azure.archive.ubuntu.com/ubuntu http://archive.ubuntu.com/ubuntu http://us.archive.ubuntu.com/ubuntu})
  # Every mirror with the speed floor, then the first again without it: when
  # the whole network is slow rather than one mirror, a slow file still beats
  # none, and the step's own bound is what stops it.
  for try in "${mirrors[@]}" "nofloor ${mirrors[0]}"; do
    m=${try#nofloor } floor=(-y 20 -Y 300000)
    [[ $try == nofloor* ]] && floor=()
    rm -f "$dir/$file.part"
    if curl -fsS --connect-timeout 10 --max-time 180 "${floor[@]}" -o "$dir/$file.part" "$m/$pool" &&
       [[ $(stat -c %s "$dir/$file.part") == "$size" ]] &&
       [[ $($tool "$dir/$file.part" | cut -d' ' -f1) == "${sum#*:}" ]]; then
      mv "$dir/$file.part" "$dir/$file"
      exit 0
    fi
    echo "  $file: not whole from $m, trying the next mirror"
  done
  rm -f "$dir/$file.part"
  echo "::error title=debcache::$file came whole from no mirror"
  exit 1
fi

dir=${1:?usage: debcache.sh <dir> <package...>}
shift
nosrc=$(mktemp -d)
offline=(-o Dir::Etc::SourceList=/dev/null -o "Dir::Etc::SourceParts=$nosrc")

if compgen -G "$dir/*.deb" > /dev/null &&
   sudo apt-get "${offline[@]}" install -y -q --no-install-recommends "$dir"/*.deb; then
  echo "$* installed from $(ls "$dir"/*.deb | wc -l) cached packages, no mirror asked"
  exit 0
fi

echo "::warning title=debcache::no cached packages for $* that fit this runner; fetching them"
rm -rf "${dir:?}"
mkdir -p "$dir"
sudo apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 update -q
apt-get install --print-uris -qq --no-install-recommends "$@" | grep "^'" > "$nosrc/uris" || true
if [[ ! -s "$nosrc/uris" ]]; then
  echo "$* already installed on this runner; nothing to fetch"
  exit 0
fi
echo "$(wc -l < "$nosrc/uris") packages to fetch"
start=$SECONDS
xargs -P 8 -L 1 bash "$0" --fetch "$dir" < "$nosrc/uris"
echo "fetched $(du -sh "$dir" | cut -f1) in $((SECONDS - start)) s"
sudo apt-get "${offline[@]}" install -y -q --no-install-recommends "$dir"/*.deb
