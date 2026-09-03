<?php

return [
    'api_base_url' => rtrim(
        (string) env(
            'ADMIN_API_BASE_URL',
            'http://127.0.0.1:5000/api/v1'
        ),
        '/'
    ),
];
