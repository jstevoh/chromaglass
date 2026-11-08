# The music in the webpage's films

Each card in the webpage's row of films is one of the app's looks playing a whole 78 rpm record
from before 1926 (`src/lib/siteFilms.ts`, `npm run sitefilms`, PLAN 34a-6). The whole film is on
the ChromaGlass channel and plays on the webpage from there. The loops in this folder are cut from
those films and have no sound. This file records where each record comes from and why we may use
it. Add a record here before you add it to the list in the code.

Checked 2026-11-08. This is a record of what was checked, not legal advice.

## Why these records are free to use

All six were first published in the United States before 1926. Sound recordings fixed before
15 February 1972 are protected in the US under 17 U.S.C. § 1401, added by the Music Modernization
Act of 2018. Its schedule ends that protection for a recording first published before 1923 on
31 December 2021, and for one first published from 1923 to 1946, at the end of the 100th year after
publication. So a recording published in 1925 entered the US public domain on 1 January 2026, and
everything older did so earlier. The songs under them are older still and are in the public domain
too: each was published before 1926 (the Leoncavallo aria in 1892, the Rachmaninoff prelude in
1892, "Careless Love" is a traditional song).

So the films and their credit say the music is **public domain in the US**. That status is a US
one: elsewhere the term for a recording is set by each country's own law.

A later pressing of the same take is not a new recording. Some of the discs the Great 78 Project
transferred are reissues (a British pressing, a 1930s or 1940s reissue); the recording on them is
the same take, first published in the US in the year given below, and pressing it again adds
nothing that copyright protects. A modern remaster of a take can carry a new copyright in the
remastering, which is why these films use the archive's flat transfers and not a label's reissue.

## Where the transfers come from

Every transfer is from the Great 78 Project, which digitises the original shellac and publishes
it through the Internet Archive. `npm run sitefilms` fetches the FLAC named below, checks its
SHA-256 against the one written here and in the code, and stops if the two differ. What was done
to each: a trim to the music (past the run-in groove at the start and to just after the last note),
a 0.15 s fade in and a 1.2 s fade out, and nothing else: no noise reduction, no equalisation.

## If the channel's claim system flags a film

YouTube's Content ID can match a public-domain recording against a label's remaster of the same
take. That is a claim to dispute, not a strike: choose "public domain" in the dispute form and give
the transfer's address below and the year of first publication. The description of each film on
the channel carries the same credit.

## The records

### Riverboat Shuffle, The Wolverine Orchestra, with Bix Beiderbecke

- Composed by Hoagy Carmichael, Dick Voynow and Irving Mills. First published Gennett 5454, 1924.
- Played by the look Splodascope (`splodascope`), seed 1.
- Transfer: https://archive.org/details/78_riverbeat-shuffle_wolverine-orchestra-carmichael_gbia0009181a
- File: `Riverbeat Shuffle - Wolverine Orchestra - Carmichael.flac`
- SHA-256: `6645df2fa4625ca5f2b716eaa0605e854d65534da05182cd2b1655bd428a98df`
- The disc transferred: Gennett, the 1924 issue.
- Used: 156.53 s from 0.4 s into the file.

### Vesti la giubba, Enrico Caruso

- Composed by Ruggero Leoncavallo, from Pagliacci (1892). First published Victor 88061, 1907.
- Played by the look Solar Flare (`solar-flare`), seed 1.
- Transfer: https://archive.org/details/78_pagliacci-vesti-la-giubba-on-with-the-play-act-1_enrico-caruso-ruggiero-leonc_gbia0276270a
- File: `Pagliacci - Vesti la giubba (On With the P - Enrico Caruso.flac`
- SHA-256: `b2b2b9e970ba2513c86df1f4c95064124ac5f35d12ba67bd08b5600726b86c92`
- The disc transferred: a Victor (Victrola) pressing of the 1907 take.
- Used: 183.33 s from 4.3 s into the file.

### Prelude in C-sharp minor, Op. 3 No. 2, Sergei Rachmaninoff

- Composed by Sergei Rachmaninoff (1892). First published Victor 66016, 1921.
- Played by the look Galaxy (`galaxy`), seed 1.
- Transfer: https://archive.org/details/78_prelude-in-c-sharp-minor_sergei-rachmaninoff-rachmaninoff_gbia0170391a
- File: `Prelude in C Sharp Minor - Sergei Rachmaninoff.flac`
- SHA-256: `c8dcaead7c958de71770815a6e276af042ffd38afb7bbafa0dc508def578826e`
- The disc transferred: a Victor (Victrola) pressing of the 1921 take.
- Used: 210.13 s from 0.9 s into the file.

### Whispering, Paul Whiteman and His Ambassador Orchestra

- Composed by John Schonberger, Richard Coburn and Vincent Rose. First published Victor 18690, 1920.
- Played by the look Aurora Borealis (`aurora-borealis`), seed 1.
- Transfer: https://archive.org/details/78_whispering_paul-whiteman-and-his-ambassador-orchestra-schonberger_gbia0120433a
- File: `Whispering - Paul Whiteman and His Ambassador Orchestra.flac`
- SHA-256: `92f1c2b8d5348cdad288644624e0ea7bf95df036b35e1feba86400720cf9be47`
- The disc transferred: His Master's Voice, the British issue of the Victor take.
- Used: 194.01 s from 5.3 s into the file.

### Tears, King Oliver's Creole Jazz Band, with Louis Armstrong

- Composed by Lil Hardin and Louis Armstrong. First published OKeh, 1923.
- Played by the look Neon Coral Reef (`neon-coral-reef`), seed 1.
- Transfer: https://archive.org/details/78_tears_king-olivers-jazz-band-hardin-armstrong-joe-oliver-louis-armstrong-johnny-do_gbia0001053a
- File: `Tears - King Oliver's Jazz Band - Hardin.flac`
- SHA-256: `f6ee2e113db24fdba13a87fe2a3922d434c823fcb4cf88b46664e2fb10b52c65`
- The disc transferred: Hot Record Society, a 1930s reissue pressed from the 1923 OKeh take.
- Used: 194.78 s from 2.9 s into the file.

### Careless Love Blues, Bessie Smith, with Louis Armstrong, Fletcher Henderson and Charlie Green

- Composed by Traditional, arranged by W. C. Handy. First published Columbia 14083-D, 1925.
- Played by the look Velvet Underground (`velvet-underground`), seed 1.
- Transfer: https://archive.org/details/78_careless-love-blues_bessie-smith-w-c-handy-fletcher-henderson-l-armstrong-c-green_gbia3043091a
- File: `CARELESS LOVE BLUES - BESSIE SMITH - W. C. Handy.flac`
- SHA-256: `8411eb9c3a059c73403e4b6033fc42837c7c47e58dfb4c0275644586ec68c931`
- The disc transferred: Parlophone, a 1942 British pressing of the 1925 Columbia take.
- Used: 205.55 s from 3.3 s into the file.

