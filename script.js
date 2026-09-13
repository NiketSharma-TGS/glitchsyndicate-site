// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Intercept the query/contact form so Formspree submits happen without
// leaving the page, and swap in a status message instead.
const queryForm = document.querySelector('.query-form');
const status = document.querySelector('.form-status');

if (queryForm) {
  queryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = queryForm.querySelector('button');
    button.disabled = true;
    status.textContent = 'Sending…';

    try {
      const response = await fetch(queryForm.action, {
        method: 'POST',
        body: new FormData(queryForm),
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        status.textContent = 'Thanks — got it. We\'ll get back to you.';
        queryForm.reset();
      } else {
        status.textContent = 'Something went wrong. Try again in a bit.';
      }
    } catch (err) {
      status.textContent = 'Something went wrong. Try again in a bit.';
    } finally {
      button.disabled = false;
    }
  });
}
