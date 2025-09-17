using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using PomodoroTracker.Services;

namespace PomodoroTracker.Pages.Account
{
    public class RegisterModel : PageModel
    {
        private readonly UserStore _store;

        public RegisterModel(UserStore store)
        {
            _store = store;
        }

        [BindProperty] public string Email { get; set; } = "";
        [BindProperty] public string Password { get; set; } = "";

        public IActionResult OnPost()
        {
            if (string.IsNullOrWhiteSpace(Email) || string.IsNullOrWhiteSpace(Password))
            {
                ModelState.AddModelError("", "Email and Password required");
                return Page();
            }

            if (_store.Register(Email, Password))
            {
                return RedirectToPage("/Account/Login");
            }
            else
            {
                ModelState.AddModelError("", "Email already registered");
                return Page();
            }
        }
    }
}



