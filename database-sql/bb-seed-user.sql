-- password for all users is "bubbles123"

\c babbling_bubbles_test

INSERT INTO users (username,
                   password,
                   email,
                   country,
                   bio,
                   date_registered,
                   permissions)
VALUES ('bubbles',
        '$2b$12$cfmWhPla9WSElxFyJ2mzfOUT5Ohxv3/Wc5wG3R.ngShRRQ3AuEHDW',
        'bubbles@gmail.com',
        'United States',
        'I love to sing and dance. My favorite food is pepperoni pizza.',
        '2023-07-09',
        'base')

\c babbling_bubbles

INSERT INTO users (username,
                   password,
                   email,
                   country,
                   bio,
                   date_registered,
                   permissions)
VALUES ('bubbles',
        '$2b$12$cfmWhPla9WSElxFyJ2mzfOUT5Ohxv3/Wc5wG3R.ngShRRQ3AuEHDW',
        'bubbles@gmail.com',
        'United States',
        'I love to sing and dance. My favorite food is pepperoni pizza.',
        '2023-07-09',
        'base')