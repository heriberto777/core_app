
// Mock of AuthApi
class AuthApi {
    async login(data) {
        console.log("🚀 AuthApi.login initiated with:", data);

        // Simulate 400 Bad Request
        const response = {
            ok: false,
            status: 400,
            statusText: "Bad Request",
            json: async () => ({ state: false, msg: "Email o contraseña incorrectos" })
        };

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (parseError) {
                throw new Error(`Server Error (${response.status}): ${response.statusText}`);
            }

            console.error("❌ HTTP Error:", errorData);
            throw new Error(errorData.msg || `Server Error (${response.status})`);
        }

        return await response.json();
    }
}

// Mock of AuthContext logic
async function login(formData) {
    const authController = new AuthApi();
    try {
        console.log("🎯 Starting login from context...");
        const response = await authController.login(formData);

        // ... success logic ...
        return { success: true };

    } catch (error) {
        console.error("❌ Error in login:", error);
        // setError(error.message);
        throw error;
    }
}

// Mock of LoginForm logic
async function handleSubmit() {
    try {
        console.log("🎯 Starting login from form...");
        await login({ email: "wrong@test.com", password: "wrong" });
    } catch (error) {
        console.error("❌ Error in login from form:", error);
        console.log("Show Swal with:", error.message);
    }
}

handleSubmit();
