/* Load order matters, and ES modules evaluate in import order:
   site.js renders the data-driven markup (certificates, evidence scan, lab notebook…)
   and defines the shared globals (gsap, ScrollTrigger, showToast, openModal); the labs
   and the terminal build on them; motion.js runs last so the motion controller can
   settle every animation the others created. */
import './site.js';
import './labs/subnet.js';
import './labs/netlab.js';
import './terminal.js';
import './ctf.js';
import './audit.js';
import './motion.js';
