# ChromaGlass as a box

A Raspberry Pi or a mini PC behind the screen, powered on, showing the plate.
No laptop, no browser to open, nothing to click. This is the same build that
runs on a laptop — the `local` tier, which already assumes it has the machine
to itself — with a service to start it and a browser told to get out of the way.

It takes about twenty minutes and nothing here is specific to a Pi; anything
that runs Node 20 and Chromium will do.

## What it does

Boots, waits for the network, serves the show on the LAN, opens itself
full-screen on the HDMI output, and starts listening to the microphone. The
phone remote, OSC, Art-Net and MIDI all work as they do on a laptop, because it
is the same server. If it is power-cycled mid-show it comes back to the same
place.

## What you need

- A machine with a GPU worth the name. A Pi 5 will hold 384² and often 512²;
  a Pi 4 will not, and the quality governor will spend the evening stepping
  down. Any x86 mini PC of the last five years is more comfortable and no
  larger.
- A USB audio input. The built-in analogue input on a Pi does not exist, and
  a cheap USB microphone is better than any of the alternatives.
- Node 20 or newer, Chromium, and `git`.

## Install

```bash
sudo apt install -y nodejs npm chromium git
git clone https://github.com/jstevoh/chromaglass.git ~/chromaglass
cd ~/chromaglass && npm install && npm run build
```

Check it by hand before making it a service:

```bash
npm run remote
```

It prints a show key and the addresses. Open the laptop one on the box itself,
and the phone one from a phone, and make sure the plate moves to the room.

## The service

`server/chromaglass.service` is a systemd unit for the server, and
`server/chromaglass-kiosk.service` opens the browser at it. Both run as the
login user rather than as root, because the browser needs a session and the
server needs nothing more.

```bash
sudo cp server/chromaglass.service server/chromaglass-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chromaglass chromaglass-kiosk
```

Edit the unit before copying it if your user is not `pi` or the clone is not in
`~/chromaglass`. The environment block is where the show key, the Art-Net host
and anything else goes — it is the same set of variables `npm run remote`
reads.

```bash
journalctl -u chromaglass -f        # the server, including the show key
journalctl -u chromaglass-kiosk -f  # the browser
```

## The flags, and why each one is there

The kiosk unit runs Chromium with these, and every one of them is load-bearing:

| | |
|---|---|
| `--kiosk` | full screen, no chrome, no way out but a keyboard nobody has |
| `--autoplay-policy=no-user-gesture-required` | the browser will not start audio before a click, and there is nobody to click. Without this the plate runs but hears nothing. |
| `--noerrdialogs --disable-session-crashed-bubble --disable-infobars` | a machine that lost power mid-show must not come back asking whether to restore tabs, over the projection |
| `--check-for-update-interval=31536000` | an update prompt is a dialog on the wall |
| `--disable-features=Translate,MediaRouter` | both put things on top of a full-screen page |
| `--use-gl=egl` | on a Pi, the difference between the GPU and a software rasteriser |
| `--enable-features=VaapiVideoDecoder` | only matters if you play film loops through the dye |

The URL carries `?kiosk=1`, which does one thing: it takes the first gesture as
given. On a laptop the first click starts the audio, which is both a browser
requirement and a reasonable thing to ask of a person who just opened a page.
There is no person here.

## Sound

`arecord -l` lists what the box can hear. The browser picks a default that is
often the wrong one, so set it once from **Settings → Sound** on the box itself
(reach it from a phone on the LAN if the box has no keyboard) and it is
remembered.

If the room is loud and the input clips, the calibration in the same panel is
the control — not the gain on the interface, which will only give the analyser
a squarer wave to look at.

## Lights

If the box is also driving the rig, put the Art-Net host in the service's
environment and the par cans follow the plate:

```
Environment=ARTNET_HOST=10.0.0.255
Environment=ARTNET_FIXTURES=6
Environment=ARTNET_ORDER=rgbw
```

See the Art-Net section of the README for the rest.

## What it is not

It is not sealed. Anyone on the network who has the show key can drive it, which
is the point — the phone remote is how you play it. On a network you do not
control, set `SHOW_KEY` to something that is not four digits.
