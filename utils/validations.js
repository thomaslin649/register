const R = require('ramda');
const { VALID_RECORD_TYPES } = require('./constants');
const { or, and, validate, between, testRegex, withLengthEq, withLengthGte } = require('./helpers');
const INVALID_NAMES = require('./invalid-domains.json');
const ipRegex_ = require('ip-regex');
const ipRegex = ipRegex_.default ?? ipRegex_;

const isValidURL = and([R.is(String), testRegex(/^https?:\/\//ig)]);

const isValidDomain = and([R.is(String), testRegex(/^(([a-z0-9-]+)\.)+[a-z]+$/ig)]);

const validateCnameRecord = type => and([
  R.propIs(String, type),
  R.compose(withLengthEq(1), R.keys), // CNAME cannot be used with any other record
  R.propSatisfies(withLengthGte(4), type),
  R.propSatisfies(isValidDomain, type),
]);

const validateARecord = type => and([
  R.propIs(Array, type),
  R.propSatisfies(withLengthGte(1), type),
  R.all(testRegex(ipRegex.v4({ exact: true }))),
]);

const validateMXRecord = type => and([
  R.propIs(Array, type),
  R.propSatisfies(withLengthGte(1), type),
  R.propSatisfies(R.all(isValidDomain), type),
]);

const validateAAAARecord = R.propSatisfies(and([
  R.is(Array),
  withLengthGte(1),
  R.all(testRegex(ipRegex.v6({ exact: true }))),
]))

const checkRestrictedNames = R.complement(R.includes(R.__, INVALID_NAMES))

const extraSupportedNames = [
  testRegex(/^_github(-pages)?-challenge-[a-z0-9-_]+$/i), // Exception for github verification records
  R.equals('_discord'),
  R.equals('_gitlab-pages-verification-code'),
  R.equals('_acme-challenge'),
  R.equals('_dmarc'),
  testRegex(/^_gh-[a-z0-9-_]+$/i), // Exception for the new github org verification records
]

const validateDomainData = validate({
  name: {
    reason: 'The name of the file is invalid. It must be lowercased, alphanumeric and each component must be more than 2 characters long',
    fn: or([
      R.equals('@'),
      and([
        R.is(String),
        checkRestrictedNames,
        R.compose(
          R.all(or([
            and([
              R.compose(between(2, 100), R.length),
              testRegex(/^[a-z0-9-]+$/g),
              checkRestrictedNames,
            ]),
            ...extraSupportedNames,
          ])),
          R.split('.'),
        ),
      ])
    ]),
  },
  description: { reason: '', fn: R.T, },
  repo: { reason: '', fn: R.T, },
  owner: {
    reason: '`owner` needs valid username and email properties',
    fn: and([
      R.is(Object),
      R.complement(R.isEmpty),
      R.where({
        username: and([R.is(String), withLengthGte(1)]),
        email: R.is(String),
      }),
    ]),
  },
  record: {
    reason: 'Invalid record. CNAME records have to be a host name and A records has to be a list of ips',
    fn: and([
      R.is(Object),
      R.compose(R.isEmpty, R.difference(R.__, VALID_RECORD_TYPES), R.keys),
      R.cond([
        [R.has('CNAME'), validateCnameRecord('CNAME')],
        [R.has('A'), validateARecord('A')],
        [R.has('URL'), R.propSatisfies(isValidURL, 'URL')],
        [R.has('MX'), validateMXRecord('MX')],
        [R.has('TXT'), R.propSatisfies(or([ R.is(String), R.is(Array) ]), 'TXT')],
        [R.has('AAAA'), validateAAAARecord('AAAA')],
        [R.T, R.T],
      ]),
    ]),
  },
});

module.exports = { validateDomainData, isValidDomain };
