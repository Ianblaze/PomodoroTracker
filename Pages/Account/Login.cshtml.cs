using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Claims;

namespace PomodoroTracker.Pages.Account
{
    public class LoginModel : PageModel
    {
        [BindProperty] public string Email { get; set; } = "";
        [BindProperty] public string Password { get; set; } = "";
        [BindProperty] public bool RememberMe { get; set; } = false;

        // optional: accept returnUrl from query string
        [BindProperty(SupportsGet = true)]
        public string? ReturnUrl { get; set; }

        public void OnGet()
        {
            // If someone navigates to /Account/Login while already authenticated,
            // redirect them to ReturnUrl or root.
            if (User?.Identity?.IsAuthenticated ?? false)
            {
                if (!string.IsNullOrEmpty(ReturnUrl)) Response.Redirect(ReturnUrl);
                else Response.Redirect("/");
            }
        }

        public async Task<IActionResult> OnPostAsync()
        {
            if (string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Password))
            {
                ModelState.AddModelError("", "Email and Password required");
                return Page();
            }

            // DEMO: Accept any email/password. Replace with validation if desired.
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, Email),
                new Claim(ClaimTypes.Email, Email)
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            var principal = new ClaimsPrincipal(identity);

            var authProperties = new AuthenticationProperties
            {
                IsPersistent = RememberMe
            };

            await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal, authProperties);

            // Redirect to returnUrl if present and local, otherwise go to root
            if (!string.IsNullOrEmpty(ReturnUrl) && Url.IsLocalUrl(ReturnUrl))
                return LocalRedirect(ReturnUrl);

            return RedirectToPage("/Index"); // or return LocalRedirect("/");
        }
    }
}


