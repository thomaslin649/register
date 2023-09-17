const R = require('ramda')
const { toHostList, registerDomains } = require('../scripts/register-domains')
const { TTL, DOMAIN_DOMAIN } = require('../utils/constants')
const { getDomainService } = require('../utils/domain-service')

const getCpanel = ({
  zone,
  addZone,
  removeZone,
  redir,
  addRedir,
  removeRedir,
  addEmail,
  removeEmail,
} = {}) => ({
  zone: {
    fetch: (_) => zone(),
    add: (rec) => addZone(rec),
    remove: (rec) => removeZone(rec),
  },
  redirection: {
    fetch: (_) => redir(),
    add: (rec) => addRedir(rec),
    remove: (rec) => removeRedir(rec),
  },
  email: {
    add: (rec) => addEmail(rec),
    remove: (rec) => removeEmail(rec),
  },
})

describe('toHostList', () => {
  it('should flatten domain data to list of hosts (without https)', () => {
    const res = toHostList([
      { name: 'akshay', record: { CNAME: 'phenax.github.io' } },
      { name: 'foobar', record: { CNAME: 'v.io' } },
      { name: 'xx', record: { A: ['1.2.3.4', '5.6.3.2', '1.2.31.1'] } },
      { name: 'xx', record: { CNAME: 'foobar.com', MX: ['as.com', 'f.com'] } },
    ])

    expect(res).toEqual([
      { name: 'akshay', type: 'CNAME', address: 'phenax.github.io', ttl: TTL },
      { name: 'foobar', type: 'CNAME', address: 'v.io', ttl: TTL },
      { name: 'xx', type: 'A', address: '1.2.3.4', ttl: TTL },
      { name: 'xx', type: 'A', address: '5.6.3.2', ttl: TTL },
      { name: 'xx', type: 'A', address: '1.2.31.1', ttl: TTL },
      { name: 'xx', type: 'CNAME', address: 'foobar.com', ttl: TTL },
      { name: 'xx', type: 'MX', address: 'as.com', priority: 20, ttl: TTL },
      { name: 'xx', type: 'MX', address: 'f.com', priority: 21, ttl: TTL },
    ])
  })
})

describe('registerDomains', () => {
  const addZone = jest.fn(async () => ({}))
  const removeZone = jest.fn(async () => ({}))
  const addRedir = jest.fn(async () => ({}))
  const removeRedir = jest.fn(async () => ({}))
  const addEmail = jest.fn(async () => ({}))
  const removeEmail = jest.fn(async () => ({}))

  const mockDS = ({ zones, redirections }) =>
    getDomainService({
      cpanel: getCpanel({
        zone: async () => zones,
        redir: async () => redirections,
        addZone,
        addEmail,
        addRedir,
        removeZone,
        removeRedir,
        removeEmail,
      }),
    })

  beforeEach(() => {
    addZone.mockClear()
    removeZone.mockClear()
    addRedir.mockClear()
    removeRedir.mockClear()
    addEmail.mockClear()
    removeEmail.mockClear()
  })

  it('should register the new set of hosts generated from domains list', async () => {
    const localHosts = [
      { name: 'a', record: { CNAME: 'hello' } },
      { name: 'b', record: { CNAME: 'xaa' } },
    ]
    const remoteHosts = [
      { line: 1, name: 'a', type: 'CNAME', address: 'hello' },
      { line: 2, name: 'b', type: 'CNAME', address: 'goo' },
      { line: 3, name: 'b', type: 'CNAME', address: 'xaa' },
    ]
    const remoteRedirections = []

    const domainService = mockDS({
      zones: remoteHosts,
      redirections: remoteRedirections,
    })
    await registerDomains({ getDomains: async () => localHosts, domainService })

    expect(addZone).toHaveBeenCalledTimes(0)
    expect(removeZone).toHaveBeenCalledTimes(1)
    expect(addRedir).toHaveBeenCalledTimes(0)
    expect(removeRedir).toHaveBeenCalledTimes(0)
  })

  it('should add the new set hosts', async () => {
    const localHosts = [
      { name: 'a', record: { CNAME: 'boo' } },
      {
        name: 'b',
        record: { A: ['1.1.1.1', '1.1.1.2'], MX: 'somemx', TXT: 'some txt' },
      },
      { name: 'c', record: { URL: 'https://google.com' } },
      { name: 'd', record: { CNAME: 'foobar' } },
      { name: 'e', record: { A: ['2.2.2.2'], TXT: ['some', 'extra', 'txt'] } },
    ]
    const remoteHosts = [
      { line: 1, name: 'a', type: 'CNAME', address: 'boo' },
      { line: 2, name: 'b', type: 'MX', address: 'othermx' },
      { line: 3, name: 'd', type: 'CNAME', address: 'foobaz' },
    ]
    const remoteRedirections = [
      { domain: `b.${DOMAIN_DOMAIN}`, destination: 'x' },
      { domain: `a.${DOMAIN_DOMAIN}`, destination: 'y' },
    ]

    const domainService = mockDS({
      zones: remoteHosts,
      redirections: remoteRedirections,
    })
    await registerDomains({ getDomains: async () => localHosts, domainService })

    expect(addZone).toHaveBeenCalledTimes(8)
    expect(addZone.mock.calls).toEqual([
      [{ name: 'b', type: 'A', address: '1.1.1.1', line: undefined }],
      [{ name: 'b', type: 'A', address: '1.1.1.2', line: undefined }],
      [
        {
          name: 'b',
          type: 'TXT',
          address: 'some txt',
          txtdata: 'some txt',
          line: undefined,
        },
      ],
      [
        {
          name: 'd',
          type: 'CNAME',
          cname: 'foobar',
          address: 'foobar',
          line: undefined,
        },
      ],
      [{ name: 'e', type: 'A', address: '2.2.2.2', line: undefined }],
      [
        {
          name: 'e',
          type: 'TXT',
          address: 'some',
          txtdata: 'some',
          line: undefined,
        },
      ],
      [
        {
          name: 'e',
          type: 'TXT',
          address: 'extra',
          txtdata: 'extra',
          line: undefined,
        },
      ],
      [
        {
          name: 'e',
          type: 'TXT',
          address: 'txt',
          txtdata: 'txt',
          line: undefined,
        },
      ],
    ])

    expect(removeZone).toHaveBeenCalledTimes(1)
    expect(removeZone.mock.calls).toEqual([[{ line: 3 }]])

    expect(addRedir).toHaveBeenCalledTimes(1)
    expect(addRedir.mock.calls).toEqual([
      [
        {
          domain: 'c.booboo.xyz',
          redirect: 'https://google.com',
          redirect_wildcard: 1,
          redirect_www: 1,
          type: 'permanent',
        },
      ],
    ])

    expect(addEmail).toHaveBeenCalledTimes(1)
    expect(addEmail.mock.calls).toEqual([
      [{ domain: 'b.is-a.dev', exchanger: 'somemx', priority: 20 }],
    ])
  })
})
