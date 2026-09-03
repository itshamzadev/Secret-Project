<?php

namespace Tests\Feature;

// use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_the_root_route_redirects_to_admin_login(): void
    {
        $response = $this->get('/');

        $response->assertRedirectToRoute('admin.login');
    }
}
