

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
        storyError.textContent = 'This story link is incomplete.';
        return;
    }
    try {
        const response = await fetch(`/api/story/${encodeURIComponent(storyToken)}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Memories could not be loaded.');
        storyItems.splice(0, storyItems.length, ...(data.items || []));
        applyStoryFilter(activeStoryFilter);
        const story = data.story || {};
        const title = document.querySelector('.title');
        if (title && story.title) { title.textContent = story.title; document.title = `${story.title} 💗`; }
        const message = document.getElementById('storyMessage');
        message.textContent = story.message || '';
        message.hidden = !story.message;
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
    }
}

const storyRevealObserver = new MutationObserver(() => {
    if (!reveal.classList.contains('show')) return;
    memoryWall.hidden = false;
    memoryWall.classList.add('story-gallery-visible');
    storyRevealObserver.disconnect();
    setTimeout(() => {
        const memoryId = location.hash.match(/^#memory-([a-f0-9]{24})$/i)?.[1];
        const target = memoryId ? document.getElementById(`memory-${memoryId}`) : memoryWall;
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
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

