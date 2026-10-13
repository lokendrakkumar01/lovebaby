

/* =========================================================
   ELEMENTS
========================================================= */

const card =
    document.getElementById("card");

const gift =
    document.getElementById("gift");

const giftScreen =
    document.getElementById("giftScreen");

const reveal =
    document.getElementById("reveal");

const tapLabel =
    document.getElementById("tapLabel");

const mainButton =
    document.getElementById("mainButton");


/* =========================================================
   EMOJI COLLECTIONS
========================================================= */

const emojiSets = {

    love:[
        "💗",
        "💖",
        "💘",
        "💕",
        "💞",
        "💓",
        "💝",
        "🩷",
        "❤️"
    ],

    kiss:[
        "😘",
        "💋",
        "🥰",
        "😍",
        "💗",
        "💕",
        "💖"
    ],

    hug:[
        "🫂",
        "🤗",
        "🥰",
        "🫶",
        "💗",
        "💕",
        "💞"
    ],

    heart:[
        "💘",
        "💝",
        "💖",
        "💗",
        "💓",
        "💕",
        "❤️‍🔥"
    ],

    flower:[
        "🌹",
        "🌸",
        "🌷",
        "🌺",
        "🌻",
        "💐",
        "🪷",
        "🌼"
    ],

    sparkle:[
        "✨",
        "💫",
        "🌟",
        "⭐",
        "🪄",
        "💖"
    ],

    party:[
        "🎉",
        "🎊",
        "🥳",
        "🎀",
        "✨",
        "💖",
        "💃"
    ],

    fire:[
        "❤️‍🔥",
        "🔥",
        "💖",
        "💗",
        "💘",
        "✨"
    ]

};


/* =========================================================
   RANDOM ITEM
========================================================= */

function randomItem(array){

    return array[
        Math.floor(
            Math.random() *
            array.length
        )
    ];

}


/* =========================================================
   GIFT OPEN
========================================================= */

let opened = false;
let loveAudio = null;
let loveTuneTimer = null;
let loveTuneStep = 0;
let loveTuneEnabled = true;
const loveTuneNotes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46, 523.25, 587.33, 659.25, 783.99, 698.46, 659.25, 587.33, 523.25];

function playLoveNote() {
    if (!loveAudio || !loveTuneEnabled || document.hidden) return;
    const now = loveAudio.currentTime;
    const oscillator = loveAudio.createOscillator();
    const volume = loveAudio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = loveTuneNotes[loveTuneStep++ % loveTuneNotes.length];
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(0.028, now + 0.055);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    oscillator.connect(volume);
    volume.connect(loveAudio.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.44);
}

async function startLoveTune() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        loveAudio ||= new AudioContextClass();
        await loveAudio.resume();
        clearInterval(loveTuneTimer);
        playLoveNote();
        loveTuneTimer = setInterval(playLoveNote, 380);
    } catch { /* Browsers without audio support still get the complete story. */ }
}

function setLoveTune(enabled) {
    loveTuneEnabled = enabled;
    const control = document.getElementById('music-toggle');
    control.setAttribute('aria-pressed', String(enabled));
    control.textContent = enabled ? '♫ Pause tune' : '♫ Play tune';
    if (enabled && opened) startLoveTune();
    else clearInterval(loveTuneTimer);
}

document.getElementById('music-toggle').addEventListener('click', () => setLoveTune(!loveTuneEnabled));
document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(loveTuneTimer);
    else if (opened && loveTuneEnabled) startLoveTune();
});

gift.addEventListener(
    "click",
    openGift
);

gift.addEventListener(
    "touchend",
    function(e){

        e.preventDefault();

        openGift();

    }
);


function openGift(){

    if(opened)
        return;

    opened = true;
    if (loveTuneEnabled) startLoveTune();


    /* gift animation */

    gift.classList.add("open");

    tapLabel.innerHTML =
        "💖 💗 💕 💘 💞 💓 💝";


    /* small delay before reveal */

    setTimeout(
        ()=>{

            giftScreen.classList.add("hide");

        },
        650
    );


    /* celebration */

    setTimeout(
        ()=>{

            celebration(
                window.innerWidth / 2,
                window.innerHeight / 2
            );

        },
        500
    );


    /* reveal title */

    setTimeout(
        ()=>{

            card.classList.add("story-open");
            card.parentElement.classList.add("story-open");
            document.body.classList.add("story-open");
            reveal.classList.add("show");

        },
        900
    );

}


/* =========================================================
   CELEBRATION
========================================================= */

function celebration(x,y){

    createFlash();


    const collection =
        emojiSets.love;


    /* center explosion */

    for(
        let i=0;
        i<75;
        i++
    ){

        setTimeout(
            ()=>{

                createBurst(
                    x,
                    y,
                    collection
                );

            },
            i * 13
        );

    }


    /* falling emojis */

    for(
        let i=0;
        i<45;
        i++
    ){

        setTimeout(
            ()=>{

                createFloating(
                    randomItem(collection),
                    Math.random()*innerWidth,
                    -30
                );

            },
            i * 30
        );

    }

}


/* =========================================================
   MAIN BUTTON
========================================================= */

mainButton.addEventListener(
    "click",
    ()=>{

        const collection =
            emojiSets.love;


        createFlash();
        launchPhotoConfetti(mainButton);

        for(
            let i=0;
            i<45;
            i++
        ){

            setTimeout(
                ()=>{

                    createBurst(
                        innerWidth/2,
                        innerHeight/2,
                        collection
                    );

                },
                i*18
            );

        }


        for(
            let i=0;
            i<30;
            i++
        ){

            setTimeout(
                ()=>{

                    createFloating(
                        randomItem(collection),
                        Math.random()*innerWidth,
                        innerHeight + 30
                    );

                },
                i*35
            );

        }


        mainButton.innerHTML =
            "💗 💖 💕 💘 💞 💓";


        setTimeout(
            ()=>{

                mainButton.innerHTML =
                    "💖 CLICK ME 💖";

            },
            1800
        );

    }
);


/* =========================================================
   ACTION BUTTONS
========================================================= */

document
.querySelectorAll(".action")
.forEach(
    button=>{

        button.addEventListener(
            "click",
            ()=>{

                const type =
                    button.dataset.type;

                const collection =
                    emojiSets[type];


                /* burst */

                for(
                    let i=0;
                    i<22;
                    i++
                ){

                    setTimeout(
                        ()=>{

                            createBurst(
                                innerWidth/2,
                                innerHeight/2,
                                collection
                            );

                        },
                        i*20
                    );

                }


                /* floating */

                for(
                    let i=0;
                    i<16;
                    i++
                ){

                    setTimeout(
                        ()=>{

                            createFloating(
                                randomItem(collection),
                                Math.random()*innerWidth,
                                innerHeight + 20
                            );

                        },
                        i*35
                    );

                }

            }
        );

    }
);


/* =========================================================
   BURST
========================================================= */

function createBurst(
    x,
    y,
    collection
){

    const element =
        document.createElement("div");


    element.className =
        "burst";


    element.textContent =
        randomItem(collection);


    element.style.left =
        x + "px";


    element.style.top =
        y + "px";


    element.style.setProperty(
        "--x",
        (Math.random()*420 - 210) + "px"
    );


    element.style.setProperty(
        "--y",
        (Math.random()*420 - 210) + "px"
    );


    element.style.setProperty(
        "--r",
        (Math.random()*720 - 360) + "deg"
    );


    document.body.appendChild(
        element
    );


    setTimeout(
        ()=>element.remove(),
        1000
    );

}


/* Burst a small selection of this story's photos from the love button. */
function launchPhotoConfetti(button) {
    const photos = storyItems.filter((item) => item.kind === "image" && item.mediaUrl);
    if (!photos.length) return;

    const rect = button.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const count = Math.min(photos.length, innerWidth < 700 ? 6 : 9);
    const selected = [...photos].sort(() => Math.random() - 0.5).slice(0, count);

    selected.forEach((item, index) => {
        const image = document.createElement("img");
        image.className = "story-photo-burst";
        image.src = item.mediaUrl;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.draggable = false;
        image.style.left = originX + "px";
        image.style.top = originY + "px";
        image.style.setProperty("--photo-x", (Math.random() * innerWidth * .82 - innerWidth * .41) + "px");
        image.style.setProperty("--photo-y", (-80 - Math.random() * Math.min(innerHeight * .58, 430)) + "px");
        image.style.setProperty("--photo-rotate", (Math.random() * 46 - 23) + "deg");
        image.style.setProperty("--photo-delay", (index * 65) + "ms");
        document.body.append(image);
        image.addEventListener("error", () => image.remove(), { once: true });
        setTimeout(() => image.remove(), 1900);
    });
}


/* =========================================================
   FLOATING EMOJI
========================================================= */

function createFloating(
    emoji,
    x,
    y
){

    const element =
        document.createElement("div");


    element.className =
        "float-emoji";


    element.textContent =
        emoji;


    const endX =
        x +
        (Math.random()*260 - 130);


    const midX =
        x +
        (Math.random()*180 - 90);


    element.style.setProperty(
        "--start-x",
        x + "px"
    );


    element.style.setProperty(
        "--start-y",
        y + "px"
    );


    element.style.setProperty(
        "--mid-x",
        midX + "px"
    );


    element.style.setProperty(
        "--mid-y",
        (y - innerHeight*.45) + "px"
    );


    element.style.setProperty(
        "--end-x",
        endX + "px"
    );


    element.style.setProperty(
        "--end-y",
        (y - innerHeight - 100) + "px"
    );


    element.style.setProperty(
        "--duration",
        (4 + Math.random()*3) + "s"
    );


    document.body.appendChild(
        element
    );


    setTimeout(
        ()=>element.remove(),
        8000
    );

}


/* =========================================================
   FLASH
========================================================= */

function createFlash(){

    const flash =
        document.createElement("div");

    flash.className =
        "flash";

    document.body.appendChild(
        flash
    );

    setTimeout(
        ()=>flash.remove(),
        800
    );

}


/* =========================================================
   CONTROLLED BACKGROUND EMOJIS
========================================================= */

setInterval(
    ()=>{

        if(
            !opened ||
            document.hidden
        )
            return;


        createFloating(
            randomItem(
                [
                    "💗",
                    "✨",
                    "💕",
                    "💖"
                ]
            ),

            Math.random() *
            innerWidth,

            innerHeight + 30

        );

    },
    1100
);

/* Load every shared album memory into the surprise page after the gift opens. */
const storyToken = location.pathname.match(/^\/story\/([A-Za-z0-9_-]{30,})\/?$/)?.[1];
const memoryWall = document.getElementById('memoryWall');
const memoryGrid = document.getElementById('story-memories');
const storyError = document.getElementById('story-error');
const storyItems = [];
let activeStoryFilter = 'all';
let storyViewerFocus = null;
let filmItems = [];
let filmIndex = 0;
let filmPlaying = false;
let filmTimer = null;
let filmStartedAt = 0;
let filmRemaining = 0;
let filmDuration = 0;
let filmFocus = null;
let filmVideo = null;
let filmStoryMessage = '';

const filmDialog = document.getElementById('story-film');
const filmStage = document.getElementById('story-film-stage');
const filmProgress = document.getElementById('story-film-progress');

function closeStoryFilm() {
    if (filmDialog.hidden) return;
    clearTimeout(filmTimer);
    filmTimer = null;
    if (filmVideo) { filmVideo.pause(); filmVideo.removeAttribute('src'); filmVideo.load(); }
    filmVideo = null;
    filmPlaying = false;
    filmDialog.hidden = true;
    document.body.classList.remove('story-film-open');
    filmFocus?.focus?.();
}

function setFilmClock(duration, resume = false) {
    clearTimeout(filmTimer);
    if (!resume) filmRemaining = duration;
    filmStartedAt = performance.now();
    filmDuration = duration;
    filmPlaying = true;
    filmDialog.classList.remove('is-paused');
    filmTimer = setTimeout(() => showFilmItem(filmIndex + 1), filmRemaining);
    document.getElementById('story-film-play').textContent = 'Ⅱ';
    document.getElementById('story-film-play').setAttribute('aria-label', 'Pause story');
}

function makeFilmProgress(activeIndex) {
    filmProgress.replaceChildren();
    filmItems.forEach((_item, index) => {
        const segment = document.createElement('i');
        if (index < activeIndex) segment.className = 'is-complete';
        if (index === activeIndex) {
            segment.className = 'is-active';
            segment.style.setProperty('--film-duration', `${filmDuration}ms`);
            if (!filmPlaying) segment.classList.add('is-paused');
        }
        filmProgress.append(segment);
    });
}

function showFilmItem(index) {
    clearTimeout(filmTimer);
    filmTimer = null;
    if (filmVideo) { filmVideo.pause(); filmVideo.removeAttribute('src'); filmVideo.load(); filmVideo = null; }
    filmIndex = index;
    filmPlaying = true;
    filmDialog.classList.remove('is-paused');
    filmStage.replaceChildren();
    document.getElementById('story-film-actions').replaceChildren();
    const caption = document.getElementById('story-film-caption');
    const byline = document.getElementById('story-film-byline');
    const overline = document.getElementById('story-film-overline');
    const playButton = document.getElementById('story-film-play');
    if (index >= filmItems.length) {
        filmPlaying = false;
        filmProgress.replaceChildren();
        document.getElementById('story-film-counter').textContent = 'THE END · AND A NEW BEGINNING';
        overline.textContent = 'TO BE CONTINUED';
        caption.textContent = filmStoryMessage || 'Here’s to every little moment still waiting for us.';
        byline.textContent = 'Made with love, just for you';
        filmStage.append(storyText('div', 'story-film-finale', '♡'));
        playButton.textContent = '↻';
        playButton.setAttribute('aria-label', 'Play story again');
        return;
    }

    const item = filmItems[index];
    document.getElementById('story-film-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${String(filmItems.length).padStart(2, '0')}`;
    overline.textContent = item.kind === 'video' ? 'A MOMENT IN MOTION' : item.kind === 'note' ? 'WORDS TO KEEP CLOSE' : 'A MOMENT TO KEEP';
    caption.textContent = item.kind === 'note' ? item.text : item.caption || (item.kind === 'video' ? 'A little moment in motion' : 'A little moment, kept forever');
    byline.textContent = item.ownerName ? `Shared by ${item.ownerName}` : item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'With all my love';
    if (item.kind === 'note') {
        filmStage.append(storyText('blockquote', 'story-film-note', `“${item.text}”`));
    } else {
        const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
        media.className = 'story-film-media';
        media.src = item.mediaUrl;
        media.alt = item.caption || 'A memory shared with love';
        if (item.kind === 'video') {
            media.controls = true;
            media.playsInline = true;
            media.preload = 'metadata';
            media.addEventListener('ended', () => { if (filmPlaying) showFilmItem(filmIndex + 1); }, { once: true });
            media.addEventListener('error', () => { filmStage.append(storyText('p', 'story-film-media-error', 'This video could not be loaded. You can continue to the next memory.')); }, { once: true });
            media.addEventListener('play', () => { filmPlaying = true; document.getElementById('story-film-play').textContent = 'Ⅱ'; document.getElementById('story-film-play').setAttribute('aria-label', 'Pause video'); });
            media.addEventListener('pause', () => { filmPlaying = false; document.getElementById('story-film-play').textContent = '▶'; document.getElementById('story-film-play').setAttribute('aria-label', 'Play video'); });
            filmVideo = media;
        } else {
            media.decoding = 'async';
            media.addEventListener('error', () => { media.replaceWith(storyText('p', 'story-film-media-error', 'This photo could not be loaded.')); }, { once: true });
        }
        filmStage.append(media);
    }

    const actions = document.getElementById('story-film-actions');
    if (item.spotifyTrack?.id) {
        const songButton = storyText('button', 'story-film-action', '♫ Listen to this moment');
        songButton.type = 'button';
        songButton.addEventListener('click', () => {
            const frame = document.createElement('iframe');
            frame.src = `https://open.spotify.com/embed/track/${encodeURIComponent(item.spotifyTrack.id)}?utm_source=generator`;
            frame.title = `Spotify track: ${item.spotifyTrack.title || 'Memory song'}`;
            frame.loading = 'lazy';
            frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            actions.replaceChildren(frame);
            songButton.textContent = `♫ ${item.spotifyTrack.title || 'Memory song'}`;
            actions.prepend(songButton);
        });
        actions.append(songButton);
    }
    if (item.mediaUrl) {
        const download = storyText('a', 'story-film-action', '↓ Save this memory');
        download.href = `${item.mediaUrl}?download=1`;
        download.download = `memory-${item.id}`;
        actions.append(download);
    }

    document.getElementById('story-film-prev').disabled = index === 0;
    playButton.textContent = 'Ⅱ';
    playButton.setAttribute('aria-label', 'Pause story');
    if (item.kind === 'video') {
        filmDuration = 0;
        filmProgress.replaceChildren();
        filmPlaying = false;
        playButton.textContent = '▶';
        playButton.setAttribute('aria-label', 'Play video');
        mediaPlayVideo(filmVideo, playButton);
    } else {
        setFilmClock(item.kind === 'note' ? 9000 : 7000);
        makeFilmProgress(index);
    }
}

async function mediaPlayVideo(video, button) {
    try {
        await video.play();
        filmPlaying = true;
        button.textContent = 'Ⅱ';
        button.setAttribute('aria-label', 'Pause video');
    } catch {
        filmPlaying = false;
        button.textContent = '▶';
        button.setAttribute('aria-label', 'Play video');
    }
}

function startStoryFilm() {
    filmItems = storyItems.filter((item) => item.kind === 'image' || item.kind === 'video' || item.kind === 'note');
    if (!filmItems.length) return;
    filmFocus = document.activeElement;
    filmIndex = 0;
    filmDialog.hidden = false;
    document.body.classList.add('story-film-open');
    showFilmItem(0);
    document.getElementById('story-film-close').focus();
}

function toggleStoryFilm() {
    if (filmIndex >= filmItems.length) { startStoryFilm(); return; }
    const button = document.getElementById('story-film-play');
    if (filmVideo) {
        if (filmVideo.paused) mediaPlayVideo(filmVideo, button);
        else { filmVideo.pause(); filmPlaying = false; button.textContent = '▶'; button.setAttribute('aria-label', 'Play video'); }
        return;
    }
    if (filmPlaying) {
        clearTimeout(filmTimer);
        filmRemaining = Math.max(0, filmRemaining - (performance.now() - filmStartedAt));
        filmPlaying = false;
        filmDialog.classList.add('is-paused');
        button.textContent = '▶';
        button.setAttribute('aria-label', 'Resume story');
    } else {
        setFilmClock(filmRemaining, true);
    }
}

document.getElementById('story-film-launch').addEventListener('click', startStoryFilm);
document.getElementById('story-film-close').addEventListener('click', closeStoryFilm);
document.getElementById('story-film-prev').addEventListener('click', () => showFilmItem(Math.max(0, filmIndex - 1)));
document.getElementById('story-film-next').addEventListener('click', () => showFilmItem(filmIndex >= filmItems.length ? 0 : filmIndex + 1));
document.getElementById('story-film-play').addEventListener('click', toggleStoryFilm);
document.addEventListener('keydown', (event) => {
    if (filmDialog.hidden) return;
    if (event.key === 'Escape') { closeStoryFilm(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); showFilmItem(Math.max(0, filmIndex - 1)); }
    if (event.key === 'ArrowRight') { event.preventDefault(); showFilmItem(filmIndex >= filmItems.length ? 0 : filmIndex + 1); }
    if (event.key === ' ' && !['BUTTON', 'A', 'IFRAME'].includes(document.activeElement?.tagName)) { event.preventDefault(); toggleStoryFilm(); }
});
filmStage.addEventListener('touchstart', (event) => { filmStage.dataset.touchX = String(event.changedTouches[0]?.clientX || 0); }, { passive: true });
filmStage.addEventListener('touchend', (event) => {
    const startX = Number(filmStage.dataset.touchX || 0);
    const delta = (event.changedTouches[0]?.clientX || startX) - startX;
    if (Math.abs(delta) < 55) return;
    showFilmItem(delta < 0 ? Math.min(filmItems.length, filmIndex + 1) : Math.max(0, filmIndex - 1));
}, { passive: true });

/* Build a shareable keepsake movie locally in the browser. */
const movieButton = document.getElementById('story-movie-launch');
const movieStudio = document.getElementById('story-video-studio');
const surpriseMemoryPreview = document.getElementById('surprise-memory-preview');
const surpriseMemoryCount = document.getElementById('surprise-memory-count');
const surpriseMemoryStrip = document.getElementById('surprise-memory-strip');
const surpriseMemoryMake = document.getElementById('surprise-memory-make');
const surpriseMemoryWatch = document.getElementById('surprise-memory-watch');
const surpriseMemoryGallery = document.getElementById('surprise-memory-gallery');
const movieStatus = document.getElementById('story-video-status');
const movieProgress = document.getElementById('story-video-progress');
const movieCanvas = document.createElement('canvas');
movieCanvas.width = 720;
movieCanvas.height = 1280;
let movieUrl = '';
let movieBusy = false;

function movieSleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function movieFrame() { return new Promise((resolve) => requestAnimationFrame(resolve)); }

function drawMovieFrame(ctx, media, item, itemIndex, itemCount, videoSource = false) {
    const { width, height } = movieCanvas;
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, '#3a102d'); background.addColorStop(.52, '#180f20'); background.addColorStop(1, '#100b17');
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    if (media?.videoWidth || media?.naturalWidth) {
        const sourceWidth = media.videoWidth || media.naturalWidth;
        const sourceHeight = media.videoHeight || media.naturalHeight;
        const scale = Math.min((width - 56) / sourceWidth, (height * .72) / sourceHeight);
        const drawWidth = sourceWidth * scale; const drawHeight = sourceHeight * scale;
        ctx.save(); ctx.shadowColor = '#0009'; ctx.shadowBlur = 28;
        ctx.drawImage(media, (width - drawWidth) / 2, (height * .7 - drawHeight) / 2 + 25, drawWidth, drawHeight);
        ctx.restore();
    }
    const shade = ctx.createLinearGradient(0, height * .63, 0, height);
    shade.addColorStop(0, '#100b1700'); shade.addColorStop(.25, '#100b17d9'); shade.addColorStop(1, '#100b17');
    ctx.fillStyle = shade; ctx.fillRect(0, height * .62, width, height * .38);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff9fbe'; ctx.font = '600 20px system-ui';
    ctx.fillText('A LITTLE STORY · KEPT WITH LOVE', width / 2, height - 220);
    const caption = String(item.caption || (videoSource ? 'A little moment in motion' : 'A little moment, kept forever')).trim();
    ctx.fillStyle = '#fff4f8'; ctx.font = 'italic 34px Georgia, serif';
    const words = caption.split(/\s+/); let line = ''; let lines = [];
    for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > width - 100 && line) { lines.push(line); line = word; } else line = next; }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((text, index) => ctx.fillText(text, width / 2, height - 155 + index * 43));
    if (item.ownerName) { ctx.fillStyle = '#e8cbd7'; ctx.font = '18px system-ui'; ctx.fillText(`Shared by ${item.ownerName}`, width / 2, height - 32); }
    ctx.fillStyle = '#ffffffa8'; ctx.font = '16px system-ui'; ctx.textAlign = 'right'; ctx.fillText(`${itemIndex + 1} / ${itemCount}`, width - 28, 42);
}

function waitForMoviePreview(preview) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finish(new Error('The video file was created, but this browser could not open its preview. Try downloading it or use the latest Chrome/Safari.')), 15000);
        const cleanup = () => {
            clearTimeout(timeout);
            preview.removeEventListener('loadeddata', onReady);
            preview.removeEventListener('error', onError);
        };
        const finish = (error) => { cleanup(); error ? reject(error) : resolve(); };
        const onReady = () => finish();
        const onError = () => finish(new Error('The video was created in a format this browser cannot play. Please use the latest Chrome, Edge, or Safari.'));
        preview.addEventListener('loadeddata', onReady, { once: true });
        preview.addEventListener('error', onError, { once: true });
        if (preview.readyState >= 2) finish();
    });
}

function waitForMedia(media, eventName) {
    if (media instanceof HTMLImageElement && media.complete) return media.naturalWidth ? Promise.resolve() : Promise.reject(new Error('A photo could not be loaded for the movie. Check that its Cloudinary link is public and allows browser access.'));
    if (media instanceof HTMLVideoElement && media.error) return Promise.reject(new Error('A video could not be loaded for the movie. Check that its Cloudinary link is public and allows browser access.'));
    if (media instanceof HTMLVideoElement && media.readyState >= 2) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const cleanup = () => { media.removeEventListener(eventName, onReady); media.removeEventListener('error', onError); };
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('A photo or video could not be loaded for the movie. Check that its Cloudinary link is public and allows browser access.')); };
        media.addEventListener(eventName, onReady, { once: true }); media.addEventListener('error', onError, { once: true });
    });
}

async function makeLoveMovie() {
    if (movieBusy) return;
    const items = storyItems.filter((item) => (item.kind === 'image' || item.kind === 'video') && item.mediaUrl);
    if (!items.length) { movieStatus.textContent = 'This story does not have any photos or videos to include yet.'; return; }
    const Recorder = window.MediaRecorder;
    if (!Recorder || !movieCanvas.captureStream || !(window.AudioContext || window.webkitAudioContext)) {
        movieStatus.textContent = 'This browser cannot create a video file. Try the latest Chrome or Edge on your phone or computer.'; return;
    }
    movieBusy = true; movieButton.disabled = true; movieProgress.hidden = false; movieProgress.value = 0;
    const mobileEncode = window.matchMedia('(max-width: 700px)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    movieCanvas.width = mobileEncode ? 480 : 720;
    movieCanvas.height = mobileEncode ? 854 : 1280;
    document.getElementById('story-video-actions').hidden = true;
    const preview = document.getElementById('story-video-preview'); preview.hidden = true;
    const ctx = movieCanvas.getContext('2d');
    let canvasStream; let audioContext; let recorder; let image; let video; let toneTimer; let chunks = [];
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        const audioDestination = audioContext.createMediaStreamDestination();
        let noteIndex = 0;
        const playNote = () => {
            const start = audioContext.currentTime;
            const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain();
            oscillator.type = 'sine'; oscillator.frequency.value = loveTuneNotes[noteIndex++ % loveTuneNotes.length];
            gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.09, start + .045); gain.gain.exponentialRampToValueAtTime(.0001, start + .5);
            oscillator.connect(gain); gain.connect(audioDestination); oscillator.start(start); oscillator.stop(start + .52);
        };
        playNote(); toneTimer = setInterval(playNote, 480);
        canvasStream = movieCanvas.captureStream(mobileEncode ? 15 : 24);
        const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
        const videoProbe = document.createElement('video');
        const formats = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4',
            ...(mobileEncode
                ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
                : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
        ];
        const mimeType = formats.find((type) => Recorder.isTypeSupported(type) && videoProbe.canPlayType(type));
        if (!mimeType) throw new Error('This browser cannot both create and play a supported video format. Please use the latest Chrome, Edge, or Safari.');
        recorder = new Recorder(stream, { mimeType, videoBitsPerSecond: mobileEncode ? 1_200_000 : 2_400_000 });
        recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
        const stopped = new Promise((resolve, reject) => { recorder.addEventListener('stop', resolve, { once: true }); recorder.addEventListener('error', () => reject(new Error('The browser stopped recording the movie. Try fewer or shorter videos.')), { once: true }); });
        drawMovieFrame(ctx, null, {}, 0, items.length); recorder.start(1000);
        const updateProgress = (index, fraction) => { const value = Math.min(99, Math.round(((index + fraction) / items.length) * 100)); movieProgress.value = value; movieStatus.textContent = `Creating your love film · ${index + 1} of ${items.length} · ${value}%`; };
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (item.kind === 'image') {
                image = new Image(); image.crossOrigin = 'anonymous'; image.src = item.mediaUrl;
                if (!image.complete) await waitForMedia(image, 'load');
                if (!image.naturalWidth) throw new Error('A photo could not be decoded for the movie.');
                const start = performance.now();
                while (performance.now() - start < 4200) { drawMovieFrame(ctx, image, item, index, items.length); updateProgress(index, Math.min(1, (performance.now() - start) / 4200)); await movieFrame(); }
            } else {
                video = document.createElement('video'); video.crossOrigin = 'anonymous'; video.src = item.mediaUrl;
                video.muted = true; video.playsInline = true; video.preload = 'auto';
                if (video.readyState < 2) await waitForMedia(video, 'loadeddata');
                await video.play();
                while (!video.ended && !video.error) { drawMovieFrame(ctx, video, item, index, items.length, true); updateProgress(index, Number.isFinite(video.duration) && video.duration ? video.currentTime / video.duration : 0); await movieFrame(); }
                if (video.error) throw new Error('A video could not be read. Check the Cloudinary video URL and try again.');
                video.pause(); video.removeAttribute('src'); video.load(); video = null;
            }
        }
        clearInterval(toneTimer); toneTimer = null; recorder.stop(); await stopped;
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) throw new Error('The video was empty. Please try again.');
        if (movieUrl) URL.revokeObjectURL(movieUrl);
        movieUrl = URL.createObjectURL(blob);
        preview.src = movieUrl;
        preview.hidden = false;
        preview.load();
        await waitForMoviePreview(preview);
        document.getElementById('story-video-download').href = movieUrl;
        document.getElementById('story-video-download').download = mimeType.startsWith('video/mp4') ? 'our-love-story.mp4' : 'our-love-story.webm';
        document.getElementById('story-video-actions').hidden = false;
        const shareButton = document.getElementById('story-video-share'); shareButton.hidden = !(navigator.share && navigator.canShare);
        movieProgress.value = 100; movieStatus.textContent = `Your ${items.length}-memory love film is ready. Download it or share it from your phone.`;
    } catch (error) {
        if (recorder?.state === 'recording') { try { recorder.stop(); } catch {} }
        if (movieUrl) { URL.revokeObjectURL(movieUrl); movieUrl = null; }
        preview.removeAttribute('src');
        preview.hidden = true;
        document.getElementById('story-video-actions').hidden = true;
        movieStatus.textContent = error?.message || 'The video could not be created. Please try again.';
    } finally {
        clearInterval(toneTimer); if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
        canvasStream?.getTracks().forEach((track) => track.stop());
        audioContext?.close().catch(() => {});
        movieBusy = false; movieButton.disabled = false;
    }
}

function renderSurpriseMemoryStrip(items) {
    const mediaItems = items.filter((item) => (item.kind === 'image' || item.kind === 'video') && item.mediaUrl);
    surpriseMemoryStrip.replaceChildren();
    if (!mediaItems.length) {
        surpriseMemoryPreview.hidden = false;
        surpriseMemoryCount.textContent = items.length ? 'A note is waiting here, but there are no photos or videos yet.' : 'Your photo and video memories will appear here.';
        surpriseMemoryWatch.disabled = items.length === 0;
        surpriseMemoryMake.disabled = true;
        return;
    }
    const photoCount = mediaItems.filter((item) => item.kind === 'image').length;
    const videoCount = mediaItems.filter((item) => item.kind === 'video').length;
    surpriseMemoryCount.textContent = `${mediaItems.length} memories · ${photoCount} photos · ${videoCount} videos`;
    mediaItems.slice(0, 7).forEach((item, index) => {
        const tile = document.createElement('article');
        tile.className = `surprise-memory-tile${item.kind === 'video' ? ' is-video' : ''}`;
        tile.style.setProperty('--tile-index', index);
        if (item.kind === 'image') {
            const image = document.createElement('img');
            image.src = item.mediaUrl; image.alt = item.caption || 'A photo memory'; image.loading = 'lazy'; image.decoding = 'async';
            tile.append(image);
        } else {
            const icon = document.createElement('span'); icon.className = 'surprise-memory-video-icon'; icon.textContent = '▶'; icon.setAttribute('aria-hidden', 'true');
            tile.append(icon, storyText('small', 'surprise-memory-video-label', 'VIDEO'));
        }
        surpriseMemoryStrip.append(tile);
    });
    if (mediaItems.length > 7) surpriseMemoryStrip.append(storyText('div', 'surprise-memory-more', `+${mediaItems.length - 7}`));
    surpriseMemoryPreview.hidden = false;
    surpriseMemoryWatch.disabled = false;
    const canMakeVideo = mediaItems.some((item) => item.kind === 'image' || item.kind === 'video');
    surpriseMemoryMake.disabled = !canMakeVideo;
}
function launchLoveMovie() {
    movieStudio.hidden = false;
    movieStudio.scrollIntoView({ behavior: 'smooth', block: 'center' });
    makeLoveMovie();
}
surpriseMemoryWatch.addEventListener('click', startStoryFilm);
surpriseMemoryMake.addEventListener('click', launchLoveMovie);
surpriseMemoryGallery.addEventListener('click', () => memoryWall.scrollIntoView({ behavior: 'smooth', block: 'start' }));

movieButton.addEventListener('click', launchLoveMovie);
document.getElementById('story-video-share').addEventListener('click', async () => {
    if (!movieUrl) return;
    try {
        const blob = await (await fetch(movieUrl)).blob(); const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'; const file = new File([blob], `our-love-story.${extension}`, { type: blob.type });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Our little love film', text: 'A few memories, together with love.' });
    } catch (error) { if (error.name !== 'AbortError') movieStatus.textContent = 'Sharing was not available. Download the video and share it from your device.'; }
});

function storyText(tag, className, value) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = value;
    return element;
}

function openStoryViewer(item) {
    const viewer = document.getElementById('story-viewer');
    const content = document.getElementById('story-viewer-content');
    const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
    media.src = item.mediaUrl;
    media.alt = item.caption || 'A memory shared with love';
    if (item.kind === 'video') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
    content.replaceChildren(media);
    storyViewerFocus = document.activeElement;
    viewer.hidden = false;
    document.body.classList.add('story-viewer-open');
    document.getElementById('story-viewer-close').focus();
}

function closeStoryViewer() {
    const viewer = document.getElementById('story-viewer');
    if (viewer.hidden) return;
    viewer.hidden = true;
    document.getElementById('story-viewer-content').replaceChildren();
    document.body.classList.remove('story-viewer-open');
    storyViewerFocus?.focus?.();
}

document.getElementById('story-viewer-close').addEventListener('click', closeStoryViewer);
document.getElementById('story-viewer').addEventListener('click', (event) => {
    if (event.target.id === 'story-viewer') closeStoryViewer();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeStoryViewer();
});

function renderStoryMemories(items) {
    memoryGrid.replaceChildren();
    if (!items.length) {
        const emptyCopy = storyItems.length
            ? `There are no ${{ image: 'photos', video: 'videos', note: 'notes' }[activeStoryFilter] || 'memories'} in this story yet.`
            : 'The memory gallery is waiting for its first photo, video or note.';
        memoryGrid.append(storyText('p', 'story-load-error', emptyCopy));
        return;
    }
    items.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = `story-memory${item.kind === 'note' ? ' story-note' : ''}`;
        card.dataset.kind = item.kind;
        card.id = `memory-${item.id}`;
        card.style.animationDelay = `${Math.min(index * 35, 300)}ms`;
        if (item.kind === 'image' || item.kind === 'video') {
            const media = document.createElement(item.kind === 'video' ? 'video' : 'img');
            media.className = 'story-media';
            media.src = item.mediaUrl;
            media.alt = item.caption || 'A memory shared with love';
            if (item.kind === 'video') {
                media.controls = true;
                media.preload = 'metadata';
                media.playsInline = true;
            } else {
                media.loading = 'lazy';
                media.decoding = 'async';
            }
            media.addEventListener('error', () => {
                media.replaceWith(storyText('div', 'story-media story-media-error', 'This memory could not be loaded right now.'));
            }, { once: true });
            card.append(media);
        }
        const copy = document.createElement('div');
        copy.className = 'story-memory-copy';
        const caption = item.kind === 'note' ? item.text : (item.caption || (item.kind === 'video' ? 'A little video memory' : 'A little photo memory'));
        copy.append(storyText('p', 'story-memory-caption', caption));
        if (item.ownerName) copy.append(storyText('small', 'story-memory-byline', `Shared by ${item.ownerName}`));
        if (item.createdAt) {
            const date = new Date(item.createdAt);
            if (!Number.isNaN(date.valueOf())) {
                const time = storyText('time', 'story-memory-date', date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
                time.dateTime = item.createdAt;
                copy.append(time);
            }
        }
        const actions = document.createElement('div');
        actions.className = 'story-memory-actions';
        if (item.spotifyTrack?.id) {
            const songButton = storyText('button', 'story-memory-action story-song-button', `♫ Play song · ${item.spotifyTrack.title || 'Spotify'}`);
            songButton.type = 'button';
            songButton.setAttribute('aria-expanded', 'false');
            const songPlayer = document.createElement('div');
            songPlayer.className = 'story-memory-spotify';
            songPlayer.hidden = true;
            songButton.addEventListener('click', () => {
                if (songPlayer.hidden) {
                    songPlayer.hidden = false;
                    if (!songPlayer.firstChild) {
                        const frame = document.createElement('iframe');
                        frame.src = `https://open.spotify.com/embed/track/${encodeURIComponent(item.spotifyTrack.id)}?utm_source=generator`;
                        frame.title = `Spotify track: ${item.spotifyTrack.title || 'Memory song'}`;
                        frame.loading = 'lazy'; frame.allowFullscreen = true;
                        frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
                        frame.referrerPolicy = 'strict-origin-when-cross-origin';
                        songPlayer.append(frame);
                    }
                    songButton.setAttribute('aria-expanded', 'true');
                    songButton.textContent = `♫ Hide player · ${item.spotifyTrack.title || 'Spotify'}`;
                } else {
                    songPlayer.hidden = true;
                    songButton.setAttribute('aria-expanded', 'false');
                    songButton.textContent = `♫ Play song · ${item.spotifyTrack.title || 'Spotify'}`;
                }
            });
            actions.append(songButton);
            copy.append(songPlayer);
        }
        if (item.mediaUrl) {
            const view = storyText('button', 'story-memory-action', item.kind === 'video' ? '⛶ View video' : '⛶ View photo');
            view.type = 'button';
            view.addEventListener('click', () => openStoryViewer(item));
            actions.append(view);
            const download = storyText('a', 'story-memory-action', '↓ Download');
            download.href = `${item.mediaUrl}?download=1`;
            download.download = `memory-${item.id}`;
            actions.append(download);
        } else if (item.kind === 'note') {
            const download = storyText('button', 'story-memory-action', '↓ Download note');
            download.type = 'button';
            download.addEventListener('click', () => {
                const url = URL.createObjectURL(new Blob([item.text], { type: 'text/plain;charset=utf-8' }));
                const link = document.createElement('a');
                link.href = url; link.download = `memory-${item.id}.txt`; link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            });
            actions.append(download);
        }
        const share = storyText('button', 'story-memory-action', '↗ Share');
        share.type = 'button';
        share.addEventListener('click', async () => {
            const url = `${location.origin}${location.pathname}#memory-${item.id}`;
            try {
                if (navigator.share) await navigator.share({ title: item.caption || 'A memory', text: 'A memory to keep', url });
                else { await navigator.clipboard.writeText(url); storyError.textContent = 'Memory link copied.'; }
            } catch (error) { if (error.name !== 'AbortError') storyError.textContent = 'Copy the story link from your browser address bar.'; }
        });
        actions.append(share);
        copy.append(actions);
        card.append(copy);
        memoryGrid.append(card);
    });
}

function applyStoryFilter(filter) {
    activeStoryFilter = filter;
    const counts = {
        all: storyItems.length,
        image: storyItems.filter((item) => item.kind === 'image').length,
        video: storyItems.filter((item) => item.kind === 'video').length,
        note: storyItems.filter((item) => item.kind === 'note').length
    };
    document.querySelectorAll('[data-story-filter]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.storyFilter === filter));
        const labels = { all: 'All', image: 'Photos', video: 'Videos', note: 'Notes' };
        button.textContent = `${labels[button.dataset.storyFilter]} · ${counts[button.dataset.storyFilter]}`;
    });
    const visible = storyItems.filter((item) => filter === 'all' || item.kind === filter);
    renderStoryMemories(visible);
}

document.getElementById('story-filters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-story-filter]');
    if (button) applyStoryFilter(button.dataset.storyFilter);
});

async function loadStoryMemories() {
    if (!storyToken) {
        const message = 'This story link is incomplete. Ask the admin to create and share a fresh story link.';
        storyError.textContent = message;
        document.getElementById('story-film-launch').disabled = true;
        movieButton.disabled = true;
        movieButton.querySelector('small').textContent = 'Waiting for a valid story link';
        surpriseMemoryPreview.hidden = false;
        surpriseMemoryCount.textContent = message;
        surpriseMemoryWatch.disabled = true;
        surpriseMemoryMake.disabled = true;
        return;
    }
    try {
        const response = await fetch(`/api/story/${encodeURIComponent(storyToken)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Memories could not be loaded.');
        storyItems.splice(0, storyItems.length, ...(data.items || []));
        applyStoryFilter(activeStoryFilter);
        const story = data.story || {};
        filmStoryMessage = story.message || '';
        const filmLaunch = document.getElementById('story-film-launch');
        filmLaunch.disabled = storyItems.length === 0;
        filmLaunch.querySelector('small').textContent = storyItems.length ? `${storyItems.length} little ${storyItems.length === 1 ? 'moment' : 'moments'}, one story` : 'Memories will appear here when they are added';
        const movieItems = storyItems.filter((item) => (item.kind === 'image' || item.kind === 'video') && item.mediaUrl);
        renderSurpriseMemoryStrip(storyItems);
        movieButton.disabled = movieItems.length === 0;
        movieButton.querySelector('small').textContent = movieItems.length ? `${movieItems.length} photos and videos · love tone included` : 'Add a photo or video to make your film';
        const title = document.querySelector('.title');
        if (title && story.title) { title.textContent = story.title; document.title = `${story.title} 💗`; }
        const message = document.getElementById('storyMessage');
        message.textContent = story.message || '';
        message.hidden = !story.message;
        const isLongMessage = (story.message || '').length > 180;
        let messageToggle = document.getElementById('story-message-toggle');
        if (!messageToggle) {
            messageToggle = document.createElement('button');
            messageToggle.id = 'story-message-toggle';
            messageToggle.className = 'story-message-toggle';
            messageToggle.type = 'button';
            message.insertAdjacentElement('afterend', messageToggle);
            messageToggle.addEventListener('click', () => {
                const expanded = message.classList.toggle('is-expanded');
                messageToggle.setAttribute('aria-expanded', String(expanded));
                messageToggle.textContent = expanded ? 'Show less' : 'Read the full note';
            });
        }
        messageToggle.hidden = !story.message || !isLongMessage;
        message.classList.toggle('is-collapsed', isLongMessage);
        message.classList.remove('is-expanded');
        messageToggle.setAttribute('aria-expanded', 'false');
        messageToggle.textContent = 'Read the full note';
        const description = story.subtitle || 'Every photo, video and message, together.';
        document.getElementById('storySubtitle').textContent = `${description} · ${data.items.length} ${data.items.length === 1 ? 'memory' : 'memories'}`;
        const player = document.getElementById('story-spotify-track');
        player.replaceChildren();
        const storyTrack = story.spotifyTrack || data.items.find((item) => item.spotifyTrack?.id)?.spotifyTrack;
        if (storyTrack?.id) {
            player.hidden = false;
            player.append(storyText('h3', 'story-spotify-title', story.spotifyTrack ? 'A song for this story' : 'Songs from your memories'));
            player.append(storyText('p', 'story-spotify-note', 'Spotify player · press play when you want to listen.'));
            const frame = document.createElement('iframe');
            frame.src = `https://open.spotify.com/embed/track/${encodeURIComponent(storyTrack.id)}?utm_source=generator`;
            frame.title = `Spotify track: ${storyTrack.title || 'Story song'}`;
            frame.loading = 'lazy'; frame.allowFullscreen = true;
            frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            player.append(frame);
        } else player.hidden = true;
    } catch (error) {
        storyError.textContent = error.message;
        document.getElementById('story-film-launch').disabled = true;
        movieButton.disabled = true;
        movieButton.querySelector('small').textContent = 'Memories could not be loaded';
        surpriseMemoryPreview.hidden = false;
        surpriseMemoryCount.textContent = /no longer available|no longer active/i.test(error.message)
            ? 'This story link is no longer active. Ask the admin to create and share a new one.'
            : `Could not load the memories: ${error.message}`;
        surpriseMemoryStrip.replaceChildren();
        surpriseMemoryWatch.disabled = true;
        surpriseMemoryMake.disabled = true;
    }
}

const storyRevealObserver = new MutationObserver(() => {
    if (!reveal.classList.contains('show')) return;
    memoryWall.hidden = false;
    memoryWall.classList.add('story-gallery-visible');
    storyRevealObserver.disconnect();
    const memoryId = location.hash.match(/^#memory-([a-f0-9]{24})$/i)?.[1];
    if (memoryId) setTimeout(() => document.getElementById(`memory-${memoryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
});
storyRevealObserver.observe(reveal, { attributes: true, attributeFilter: ['class'] });
loadStoryMemories();


/* =========================================================
   MOUSE 3D EFFECT
========================================================= */

document.addEventListener(
    "mousemove",
    e=>{

        if(
            window.innerWidth <= 700
        )
            return;


        const x =
            e.clientX /
            window.innerWidth -
            .5;


        const y =
            e.clientY /
            window.innerHeight -
            .5;


        card.style.transform =

            `rotateX(${-y*5}deg)
             rotateY(${x*7}deg)`;

    }
);


/* reset */

document.addEventListener(
    "mouseleave",
    ()=>{

        card.style.transform =
            "rotateX(0deg) rotateY(0deg)";

    }
);


/* =========================================================
   CLICK ANYWHERE → SMALL HEART
========================================================= */

document.addEventListener(
    "click",
    e=>{

        if(
            e.target.closest(".gift-wrap") ||
            e.target.closest(".main-button") ||
            e.target.closest(".action")
        )
            return;


        if(!opened)
            return;


        createBurst(
            e.clientX,
            e.clientY,
            emojiSets.love
        );

    }
);


/* =========================================================
   TOUCH EFFECT
========================================================= */

document.addEventListener(
    "touchstart",
    e=>{

        if(!opened)
            return;


        const touch =
            e.touches[0];


        if(!touch)
            return;


        createBurst(
            touch.clientX,
            touch.clientY,
            emojiSets.love
        );

    },
    {passive:true}
);


/* =========================================================
   PARTICLE SYSTEM
========================================================= */

const canvas =
    document.getElementById(
        "particles"
    );

const ctx =
    canvas.getContext("2d");


let particles = [];
const storyDpr = Math.min(window.devicePixelRatio || 1, 1.5);
const reduceStoryMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let particleAnimationRunning = false;


function resizeCanvas(){

    canvas.width =
        window.innerWidth *
        storyDpr;

    canvas.height =
        window.innerHeight *
        storyDpr;


    canvas.style.width =
        window.innerWidth + "px";

    canvas.style.height =
        window.innerHeight + "px";


    ctx.setTransform(
        storyDpr,
        0,
        0,
        window.devicePixelRatio,
        0,
        0
    );

}


resizeCanvas();


window.addEventListener(
    "resize",
    resizeCanvas
);


/* create particles */

for(let i=0, particleCount=window.innerWidth<700?30:56; i<particleCount; i++){

    particles.push({

        x:
            Math.random() *
            window.innerWidth,

        y:
            Math.random() *
            window.innerHeight,

        size:
            Math.random()*1.8+.3,

        speed:
            Math.random()*.35+.05,

        alpha:
            Math.random()*.7+.1,

        drift:
            Math.random()*1.2-0.6

    });

}


/* animate */

function animateParticles(){

    if(document.hidden || reduceStoryMotion){
        particleAnimationRunning = false;
        return;
    }
    particleAnimationRunning = true;

    ctx.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    particles.forEach(
        p=>{

            p.y -= p.speed;

            p.x +=
                Math.sin(
                    p.y*.008
                ) *
                .15 +
                p.drift*.02;


            if(p.y < -10){

                p.y =
                    window.innerHeight +
                    10;

                p.x =
                    Math.random() *
                    window.innerWidth;

            }


            ctx.beginPath();


            ctx.arc(
                p.x,
                p.y,
                p.size,
                0,
                Math.PI*2
            );


            ctx.fillStyle =
                `rgba(
                    255,
                    180,
                    215,
                    ${p.alpha}
                )`;


            ctx.fill();

        }
    );


    requestAnimationFrame(animateParticles);

}


if(!reduceStoryMotion) animateParticles();
document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && !reduceStoryMotion && !particleAnimationRunning) animateParticles();
});


/* =========================================================
   CHANGE MAIN HEART DYNAMICALLY
========================================================= */

const heart =
    document.querySelector(
        ".heart-emoji"
    );


const heartTypes = [

    "💖",
    "💗",
    "💘",
    "💝",
    "💞",
    "🩷",
    "❤️‍🔥"

];


let heartIndex = 0;


setInterval(
    ()=>{

        if(!opened)
            return;


        heartIndex++;


        heart.textContent =
            heartTypes[
                heartIndex %
                heartTypes.length
            ];

    },
    1800
);

